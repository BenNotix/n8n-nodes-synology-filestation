import type {
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	IDataObject,
	INodeCredentialTestResult,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import type { SynologySession } from '../SynologyFileStation/GenericFunctions';
import {
	normalizeFileStationPath,
	runSynologySearch,
	synologyLogin,
	synologyLogout,
	testSynologyCredential,
} from '../SynologyFileStation/GenericFunctions';

/**
 * How far behind the cursor each poll re-scans. A File Station search is a
 * recursive walk, not a snapshot: a file can be created in an already-walked
 * directory while the walk continues, and only show up on the next poll. The
 * overlap absorbs those races (and small NAS clock drift) — the `seen` map
 * keeps re-scanned events from firing twice.
 */
const OVERLAP_SECONDS = 300;

/** Upper bound for the per-path dedup map kept in workflow static data. */
const SEEN_CAP = 10000;

interface TriggerStaticData {
	/** NAS-side cursor (epoch seconds): events up to this time were processed. */
	watermark?: number;
	/** Event time already emitted per path, for events inside the overlap window. */
	seen?: Record<string, number>;
}

function fileTime(file: IDataObject, key: string): number | undefined {
	const time = (file.additional as IDataObject | undefined)?.time as IDataObject | undefined;
	const value = time?.[key];
	return typeof value === 'number' ? value : undefined;
}

/** Timestamp that defines "the event" for the configured trigger event. */
function eventTimeOf(file: IDataObject, event: string): number | undefined {
	if (event === 'fileCreated') {
		return fileTime(file, 'crtime');
	}
	if (event === 'fileUpdated') {
		return fileTime(file, 'mtime');
	}
	const crtime = fileTime(file, 'crtime');
	const mtime = fileTime(file, 'mtime');
	if (crtime === undefined && mtime === undefined) {
		return undefined;
	}
	return Math.max(crtime ?? 0, mtime ?? 0);
}

/**
 * Fetch the candidate files changed since `from`. "Created or updated" needs
 * the union of a crtime-filtered and an mtime-filtered search: common copy
 * tools (SMB/Finder, rsync -a, sync clients) preserve the source mtime, so a
 * freshly copied file is only visible through its crtime.
 */
async function collectCandidates(
	this: IPollFunctions,
	session: SynologySession,
	event: string,
	baseParams: IDataObject,
	from: number | undefined,
	maxWaitTime: number,
): Promise<IDataObject[]> {
	const listParams: IDataObject = { limit: -1, additional: ['size', 'time', 'type'] };
	const timeFilters =
		event === 'fileCreated'
			? ['crtime_from']
			: event === 'fileUpdated'
				? ['mtime_from']
				: ['crtime_from', 'mtime_from'];

	const byPath = new Map<string, IDataObject>();
	for (const filter of timeFilters) {
		const startParams: IDataObject = { ...baseParams };
		if (from !== undefined) {
			startParams[filter] = from;
		}
		const files = await runSynologySearch.call(this, session, startParams, listParams, maxWaitTime);
		for (const file of files) {
			byPath.set(file.path as string, file);
		}
		if (from === undefined) {
			// No time filter: one search already returns everything
			break;
		}
	}
	return [...byPath.values()];
}

// A polling trigger has no execute() and cannot be called as an AI Agent tool
// (the type only allows usableAsTool: true, so the property must be omitted)
// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool
export class SynologyFileStationTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Synology File Station Trigger',
		name: 'synologyFileStationTrigger',
		icon: { light: 'file:../../icons/synology.svg', dark: 'file:../../icons/synology.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts the workflow when files change on a Synology NAS',
		defaults: {
			name: 'Synology File Station Trigger',
		},
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'synologyApi',
				required: true,
				testedBy: 'synologyApiTest',
			},
		],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				options: [
					{
						name: 'File Created',
						value: 'fileCreated',
						description: 'Trigger for files created since the last poll',
					},
					{
						name: 'File Created or Updated',
						value: 'fileCreatedOrUpdated',
						description: 'Trigger for files created or modified since the last poll',
					},
					{
						name: 'File Updated',
						value: 'fileUpdated',
						description:
							'Trigger for files modified after their creation (a newly created file does not count as an update)',
					},
				],
				default: 'fileCreated',
			},
			{
				displayName: 'Folder to Watch',
				name: 'folderPath',
				type: 'string',
				required: true,
				default: '',
				placeholder: '/photo/uploads',
				description: 'Path of the watched folder, starting with a shared folder',
			},
			{
				displayName: 'Watch Subfolders',
				name: 'watchSubfolders',
				type: 'boolean',
				default: true,
				description: 'Whether to also watch the files inside subfolders',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				options: [
					{
						displayName: 'Extension',
						name: 'extension',
						type: 'string',
						default: '',
						placeholder: 'jpg,png',
						description:
							'Only files whose extension matches this case-insensitive glob pattern. Multiple patterns can be separated by commas.',
					},
					{
						displayName: 'File Type',
						name: 'fileType',
						type: 'options',
						options: [
							{ name: 'All', value: 'all' },
							{ name: 'Files Only', value: 'file' },
							{ name: 'Folders Only', value: 'dir' },
						],
						default: 'file',
					},
					{
						displayName: 'Max Wait Time',
						name: 'maxWaitTime',
						type: 'number',
						default: 60,
						typeOptions: { minValue: 1 },
						description: 'Maximum time in seconds to wait for the NAS-side search to finish',
					},
					{
						displayName: 'Pattern',
						name: 'pattern',
						type: 'string',
						default: '',
						placeholder: 'report_*',
						description:
							'Case-insensitive glob pattern the file names must match. Without glob characters (* or ?) the pattern matches partially. Multiple patterns can be separated by spaces.',
					},
				],
			},
		],
	};

	methods = {
		credentialTest: {
			async synologyApiTest(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				return await testSynologyCredential.call(this, credential);
			},
		},
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const staticData = this.getWorkflowStaticData('node') as TriggerStaticData;
		const event = this.getNodeParameter('event') as string;
		const folderPath = normalizeFileStationPath.call(this, this.getNodeParameter('folderPath'), 0);
		const watchSubfolders = this.getNodeParameter('watchSubfolders', true) as boolean;
		const options = this.getNodeParameter('options', {}) as IDataObject;
		const maxWaitTime = (options.maxWaitTime as number) ?? 60;
		const isManual = this.getMode() === 'manual';

		const session = await synologyLogin.call(this);
		try {
			const baseParams: IDataObject = {
				folder_path: [folderPath],
				recursive: watchSubfolders,
				filetype: (options.fileType as string) ?? 'file',
			};
			if (typeof options.pattern === 'string' && options.pattern !== '') {
				baseParams.pattern = options.pattern;
			}
			if (typeof options.extension === 'string' && options.extension !== '') {
				baseParams.extension = options.extension;
			}

			if (isManual) {
				// "Fetch test event": return the most recent matches, no state change
				const sortKey = event === 'fileCreated' ? 'crtime' : 'mtime';
				const files = await runSynologySearch.call(
					this,
					session,
					baseParams,
					{ limit: 10, sort_by: sortKey, sort_direction: 'desc', additional: ['size', 'time', 'type'] },
					maxWaitTime,
				);
				return files.length === 0 ? null : [this.helpers.returnJsonArray(files)];
			}

			// The NAS is the reference clock: its Date header, self-corrected by
			// the newest timestamp it reports (never the n8n host clock, which may
			// drift from the NAS)
			const nasNow = session.serverNow ?? Math.floor(Date.now() / 1000);
			const seen: Record<string, number> = { ...(staticData.seen ?? {}) };

			const bootstrap = staticData.watermark === undefined;
			const cursor = bootstrap ? nasNow : (staticData.watermark as number);
			const from = Math.max(0, cursor - OVERLAP_SECONDS);

			const files = await collectCandidates.call(this, session, event, baseParams, from, maxWaitTime);

			const withTimes = files
				.map((file) => ({ file, time: eventTimeOf(file, event) }))
				.filter((entry): entry is { file: IDataObject; time: number } => entry.time !== undefined);

			if (bootstrap) {
				// First poll after activation: remember what already exists inside
				// the overlap window and emit nothing
				for (const { file, time } of withTimes) {
					seen[file.path as string] = time;
				}
				staticData.watermark = nasNow;
				staticData.seen = seen;
				return null;
			}

			let emitted = withTimes.filter(({ file, time }) => {
				if (time < from) {
					return false;
				}
				const already = seen[file.path as string];
				return already === undefined || time > already;
			});

			if (event === 'fileUpdated') {
				// An update means the file changed after it was created — judged on
				// the file's own timestamps, so a brand-new file never counts
				emitted = emitted.filter(
					({ file }) => (fileTime(file, 'crtime') ?? 0) < (fileTime(file, 'mtime') ?? 0),
				);
			}

			for (const { file, time } of emitted) {
				seen[file.path as string] = time;
			}

			// Advance the cursor with NAS-side event times, clamped to NAS "now" so
			// a single future-stamped file cannot silence the trigger
			const maxObserved = withTimes.reduce((max, { time }) => Math.max(max, time), 0);
			const newWatermark = Math.max(cursor, Math.min(maxObserved, Math.max(nasNow, cursor)));
			staticData.watermark = newWatermark;

			// Prune dedup entries that fell out of the overlap window; cap the map
			// by dropping the oldest entries if a burst overflows it
			let entries = Object.entries(seen).filter(([, time]) => time >= newWatermark - OVERLAP_SECONDS);
			if (entries.length > SEEN_CAP) {
				entries = entries.sort((a, b) => b[1] - a[1]).slice(0, SEEN_CAP);
			}
			staticData.seen = Object.fromEntries(entries);

			if (emitted.length === 0) {
				return null;
			}
			return [this.helpers.returnJsonArray(emitted.map(({ file }) => file))];
		} finally {
			await synologyLogout.call(this, session);
		}
	}
}
