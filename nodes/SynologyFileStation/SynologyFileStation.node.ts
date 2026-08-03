import type {
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	IDataObject,
	IExecuteFunctions,
	INodeCredentialTestResult,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError, sleep } from 'n8n-workflow';

import { archiveFields, archiveOperations } from './descriptions/ArchiveDescription';
import {
	backgroundTaskFields,
	backgroundTaskOperations,
} from './descriptions/BackgroundTaskDescription';
import { favoriteFields, favoriteOperations } from './descriptions/FavoriteDescription';
import { fileFields, fileOperations } from './descriptions/FileDescription';
import { folderFields, folderOperations } from './descriptions/FolderDescription';
import { searchFields, searchOperations } from './descriptions/SearchDescription';
import { shareFields, shareOperations } from './descriptions/ShareDescription';
import { utilityFields, utilityOperations } from './descriptions/UtilityDescription';
import type { SynologySession } from './GenericFunctions';
import {
	authErrorMessage,
	dsmErrorCode,
	fileErrorMessage,
	fileNameFromPath,
	resolvedApiVersion,
	synologyApiRequest,
	synologyBinaryRequest,
	synologyLogin,
	synologyLogout,
	synologyUploadRequest,
	toEpochSeconds,
	waitForSynologyTask,
} from './GenericFunctions';

/** Add a param only when the user actually provided a value. */
function addIfSet(params: IDataObject, key: string, value: unknown): void {
	if (value === undefined || value === null || value === '') {
		return;
	}
	if (Array.isArray(value) && value.length === 0) {
		return;
	}
	params[key] = value;
}

/**
 * DSM error codes that genuinely mean "you may not write here" for the
 * Check Permission operation: permission denials (105, 403-407), a missing
 * path (408), a read-only file system (411) and an existing file (414).
 * Anything else (session timeout, system busy…) is a real failure.
 */
const NOT_WRITABLE_CODES = [105, 403, 404, 405, 406, 407, 408, 411, 414];

/**
 * Map the tri-state "If Target Exists" node option to the API's tri-state
 * `overwrite` parameter (true = overwrite, false = skip, omitted = fail).
 */
function overwriteToBoolean(value: unknown): boolean | undefined {
	if (value === 'overwrite') {
		return true;
	}
	if (value === 'skip') {
		return false;
	}
	return undefined;
}

/**
 * Per-file responses (getinfo, create, rename) report failures as a `code` on
 * the file object instead of a top-level error.
 */
function assertNoFileError(
	this: IExecuteFunctions,
	file: IDataObject,
	itemIndex: number,
): IDataObject {
	if (typeof file.code === 'number') {
		throw new NodeOperationError(
			this.getNode(),
			`${fileErrorMessage(file.code)} (error ${file.code})${file.path !== undefined ? `: ${file.path as string}` : ''}`,
			{ itemIndex },
		);
	}
	return file;
}

/** Best-effort file extension derived from a response media type. */
function extensionFromMimeType(mimeType?: string): string | undefined {
	const subtype = mimeType?.split(';')[0].trim().split('/')[1];
	if (subtype === undefined) {
		return undefined;
	}
	const extension = (subtype === 'jpeg' ? 'jpg' : subtype).replace(/^x-/, '');
	return /^[a-z0-9]{1,5}$/.test(extension) ? extension : undefined;
}

export class SynologyFileStation implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Synology File Station',
		name: 'synologyFileStation',
		icon: { light: 'file:../../icons/synology.svg', dark: 'file:../../icons/synology.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Manage files on a Synology NAS through the DSM File Station API',
		defaults: {
			name: 'Synology File Station',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'synologyApi',
				required: true,
				testedBy: 'synologyApiTest',
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Archive', value: 'archive' },
					{ name: 'Background Task', value: 'backgroundTask' },
					{ name: 'Favorite', value: 'favorite' },
					{ name: 'File', value: 'file' },
					{ name: 'Folder', value: 'folder' },
					{ name: 'Search', value: 'search' },
					{ name: 'Share Link', value: 'share' },
					{ name: 'Utility', value: 'utility' },
				],
				default: 'file',
			},
			...archiveOperations,
			...archiveFields,
			...backgroundTaskOperations,
			...backgroundTaskFields,
			...favoriteOperations,
			...favoriteFields,
			...fileOperations,
			...fileFields,
			...folderOperations,
			...folderFields,
			...searchOperations,
			...searchFields,
			...shareOperations,
			...shareFields,
			...utilityOperations,
			...utilityFields,
		],
	};

	methods = {
		credentialTest: {
			async synologyApiTest(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				const data = (credential.data ?? {}) as IDataObject;
				const baseUrl = String(data.baseUrl ?? '')
					.trim()
					.replace(/\/+$/, '');
				if (!/^https?:\/\//.test(baseUrl)) {
					return {
						status: 'Error',
						message: 'The base URL must start with http:// or https://',
					};
				}
				const rejectUnauthorized = data.ignoreSslIssues !== true;
				let responseBody: string;
				try {
					// ICredentialTestFunctions only exposes the `request` helper —
					// `httpRequest` is not available in credential test functions
					// eslint-disable-next-line @n8n/community-nodes/no-deprecated-workflow-functions
					responseBody = (await this.helpers.request({
						method: 'GET',
						uri: `${baseUrl}/webapi/auth.cgi`,
						qs: {
							api: 'SYNO.API.Auth',
							version: 3,
							method: 'login',
							account: data.username,
							passwd: data.password,
							session: 'FileStation',
							format: 'sid',
						},
						json: false,
						timeout: 10000,
						rejectUnauthorized,
					})) as string;
				} catch (error) {
					return {
						status: 'Error',
						message: `Could not reach the NAS: ${(error as Error).message}`,
					};
				}
				let body: IDataObject;
				try {
					body = JSON.parse(responseBody) as IDataObject;
				} catch {
					return {
						status: 'Error',
						message:
							'The URL did not return a DSM Web API response — check the base URL and port (5000 for HTTP, 5001 for HTTPS)',
					};
				}
				if (body.success !== true) {
					const code = ((body.error ?? {}) as IDataObject).code as number | undefined;
					return {
						status: 'Error',
						message:
							code !== undefined
								? `${authErrorMessage(code)} (error ${code})`
								: 'Login failed — check the username and password',
					};
				}
				// Best-effort logout so the test does not leave a session behind
				const sid = ((body.data ?? {}) as IDataObject).sid as string | undefined;
				if (sid !== undefined) {
					try {
						// eslint-disable-next-line @n8n/community-nodes/no-deprecated-workflow-functions
						await this.helpers.request({
							method: 'GET',
							uri: `${baseUrl}/webapi/auth.cgi`,
							qs: {
								api: 'SYNO.API.Auth',
								version: 3,
								method: 'logout',
								session: 'FileStation',
								_sid: sid,
							},
							json: false,
							timeout: 10000,
							rejectUnauthorized,
						});
					} catch {
						// The sid expires on its own
					}
				}
				return { status: 'OK', message: 'Authentication successful' };
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0);
		const operation = this.getNodeParameter('operation', 0);

		// One File Station session for the whole execution
		const session: SynologySession = await synologyLogin.call(this);

		try {
			for (let i = 0; i < items.length; i++) {
				try {
					let responseData: IDataObject | IDataObject[] | undefined;

					if (resource === 'file') {
						if (operation === 'copy' || operation === 'move') {
							const path = this.getNodeParameter('path', i) as string;
							const destinationFolderPath = this.getNodeParameter(
								'destinationFolderPath',
								i,
							) as string;
							const options = this.getNodeParameter('options', i, {}) as IDataObject;
							const params: IDataObject = {
								path: [path],
								dest_folder_path: destinationFolderPath,
								remove_src: operation === 'move',
							};
							addIfSet(params, 'overwrite', overwriteToBoolean(options.overwrite));
							const start = await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.CopyMove',
								'start',
								params,
							);
							const taskid = start.taskid as string;
							if (options.waitForCompletion === false) {
								responseData = { taskid };
							} else {
								responseData = await waitForSynologyTask.call(
									this,
									session,
									'SYNO.FileStation.CopyMove',
									taskid,
									(options.maxWaitTime as number) ?? 300,
									i,
								);
							}
						} else if (operation === 'delete') {
							const path = this.getNodeParameter('path', i) as string;
							const options = this.getNodeParameter('options', i, {}) as IDataObject;
							const params: IDataObject = {
								path: [path],
								recursive: options.recursive !== false,
							};
							const start = await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.Delete',
								'start',
								params,
							);
							const taskid = start.taskid as string;
							if (options.waitForCompletion === false) {
								responseData = { taskid };
							} else {
								const status = await waitForSynologyTask.call(
									this,
									session,
									'SYNO.FileStation.Delete',
									taskid,
									(options.maxWaitTime as number) ?? 300,
									i,
								);
								responseData = { success: true, path, ...status };
							}
						} else if (operation === 'download') {
							const path = this.getNodeParameter('path', i) as string;
							const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
							const info = await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.List',
								'getinfo',
								{ path: [path], additional: ['size', 'time', 'type'] },
							);
							const file = assertNoFileError.call(
								this,
								((info.files as IDataObject[]) ?? [])[0] ?? {},
								i,
							);
							const { content, contentType } = await synologyBinaryRequest.call(
								this,
								session,
								'SYNO.FileStation.Download',
								'download',
								{ path: [path], mode: 'download' },
							);
							// A folder is delivered as a ZIP archive
							const isFolder = file.isdir === true;
							const fileName = isFolder
								? `${(file.name as string) ?? fileNameFromPath(path)}.zip`
								: ((file.name as string) ?? fileNameFromPath(path));
							const binaryData = await this.helpers.prepareBinaryData(
								content,
								fileName,
								isFolder ? 'application/zip' : contentType,
							);
							returnData.push({
								json: file,
								binary: { [binaryPropertyName]: binaryData },
								pairedItem: { item: i },
							});
							continue;
						} else if (operation === 'get') {
							const path = this.getNodeParameter('path', i) as string;
							const options = this.getNodeParameter('options', i, {}) as IDataObject;
							const params: IDataObject = { path: [path] };
							addIfSet(params, 'additional', options.additional);
							const data = await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.List',
								'getinfo',
								params,
							);
							responseData = assertNoFileError.call(
								this,
								((data.files as IDataObject[]) ?? [])[0] ?? {},
								i,
							);
						} else if (operation === 'rename') {
							const path = this.getNodeParameter('path', i) as string;
							const newName = this.getNodeParameter('newName', i) as string;
							const data = await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.Rename',
								'rename',
								{ path: [path], name: [newName] },
							);
							responseData = assertNoFileError.call(
								this,
								((data.files as IDataObject[]) ?? [])[0] ?? {},
								i,
							);
						} else if (operation === 'upload') {
							const folderPath = this.getNodeParameter('folderPath', i) as string;
							const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
							const options = this.getNodeParameter('options', i, {}) as IDataObject;
							const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);
							const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
							const name =
								(this.getNodeParameter('fileName', i, '') as string) ||
								binaryData.fileName ||
								'unnamed';
							const params: IDataObject = {
								path: folderPath,
								create_parents: options.createParents !== false,
							};
							// The overwrite parameter changed type in version 3 of the Upload API
							const overwrite = overwriteToBoolean(options.overwrite);
							if (overwrite !== undefined) {
								params.overwrite =
									resolvedApiVersion(session, 'SYNO.FileStation.Upload') >= 3
										? (options.overwrite as string)
										: overwrite;
							}
							const data = await synologyUploadRequest.call(this, session, params, {
								name,
								content: buffer,
								mimeType: binaryData.mimeType ?? 'application/octet-stream',
							});
							responseData = {
								success: true,
								name,
								path: `${folderPath.replace(/\/+$/, '')}/${name}`,
								size: buffer.length,
								...data,
							};
						}
					} else if (resource === 'folder') {
						if (operation === 'create') {
							const folderPath = this.getNodeParameter('folderPath', i) as string;
							const name = this.getNodeParameter('name', i) as string;
							const options = this.getNodeParameter('options', i, {}) as IDataObject;
							const params: IDataObject = {
								folder_path: [folderPath],
								name: [name],
								force_parent: options.forceParent !== false,
							};
							addIfSet(params, 'additional', options.additional);
							const data = await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.CreateFolder',
								'create',
								params,
							);
							responseData = assertNoFileError.call(
								this,
								((data.folders as IDataObject[]) ?? [])[0] ?? {},
								i,
							);
						} else if (operation === 'delete') {
							const path = this.getNodeParameter('path', i) as string;
							const options = this.getNodeParameter('options', i, {}) as IDataObject;
							const start = await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.Delete',
								'start',
								{ path: [path], recursive: options.recursive !== false },
							);
							const taskid = start.taskid as string;
							if (options.waitForCompletion === false) {
								responseData = { taskid };
							} else {
								const status = await waitForSynologyTask.call(
									this,
									session,
									'SYNO.FileStation.Delete',
									taskid,
									(options.maxWaitTime as number) ?? 300,
									i,
								);
								responseData = { success: true, path, ...status };
							}
						} else if (operation === 'getAll') {
							const folderPath = this.getNodeParameter('folderPath', i) as string;
							const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
							const options = this.getNodeParameter('options', i, {}) as IDataObject;
							const params: IDataObject = {
								folder_path: folderPath,
								// limit 0 lists everything
								limit: returnAll ? 0 : (this.getNodeParameter('limit', i, 50) as number),
							};
							addIfSet(params, 'filetype', options.fileType);
							addIfSet(params, 'pattern', options.pattern);
							addIfSet(params, 'sort_by', options.sortBy);
							addIfSet(params, 'sort_direction', options.sortDirection);
							addIfSet(params, 'additional', options.additional);
							const data = await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.List',
								'list',
								params,
							);
							responseData = (data.files as IDataObject[]) ?? [];
						} else if (operation === 'listShares') {
							const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
							const options = this.getNodeParameter('options', i, {}) as IDataObject;
							const params: IDataObject = {
								limit: returnAll ? 0 : (this.getNodeParameter('limit', i, 50) as number),
							};
							addIfSet(params, 'onlywritable', options.onlyWritable);
							addIfSet(params, 'sort_by', options.sortBy);
							addIfSet(params, 'sort_direction', options.sortDirection);
							addIfSet(params, 'additional', options.additional);
							const data = await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.List',
								'list_share',
								params,
							);
							responseData = (data.shares as IDataObject[]) ?? [];
						}
					} else if (resource === 'share') {
						if (operation === 'clearInvalid') {
							await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.Sharing',
								'clear_invalid',
							);
							responseData = { success: true };
						} else if (operation === 'create') {
							const path = this.getNodeParameter('path', i) as string;
							const additionalFields = this.getNodeParameter(
								'additionalFields',
								i,
								{},
							) as IDataObject;
							const params: IDataObject = { path };
							addIfSet(params, 'password', additionalFields.password);
							addIfSet(params, 'date_expired', additionalFields.dateExpired);
							addIfSet(params, 'date_available', additionalFields.dateAvailable);
							const data = await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.Sharing',
								'create',
								params,
							);
							const link = ((data.links as IDataObject[]) ?? [])[0] ?? {};
							if (typeof link.error === 'number' && link.error !== 0) {
								throw new NodeOperationError(
									this.getNode(),
									`Failed to create the sharing link: ${fileErrorMessage(link.error)} (error ${link.error})`,
									{ itemIndex: i },
								);
							}
							responseData = link;
						} else if (operation === 'delete') {
							const id = this.getNodeParameter('id', i) as string;
							await synologyApiRequest.call(this, session, 'SYNO.FileStation.Sharing', 'delete', {
								id,
							});
							responseData = { success: true, id };
						} else if (operation === 'get') {
							const id = this.getNodeParameter('id', i) as string;
							responseData = await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.Sharing',
								'getinfo',
								{ id },
							);
						} else if (operation === 'getAll') {
							const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
							const options = this.getNodeParameter('options', i, {}) as IDataObject;
							const params: IDataObject = {
								limit: returnAll ? 0 : (this.getNodeParameter('limit', i, 50) as number),
							};
							addIfSet(params, 'sort_by', options.sortBy);
							addIfSet(params, 'sort_direction', options.sortDirection);
							addIfSet(params, 'force_clean', options.forceClean);
							const data = await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.Sharing',
								'list',
								params,
							);
							responseData = (data.links as IDataObject[]) ?? [];
						} else if (operation === 'update') {
							const id = this.getNodeParameter('id', i) as string;
							const updateFields = this.getNodeParameter('updateFields', i, {}) as IDataObject;
							const params: IDataObject = { id };
							if (updateFields.removePassword === true) {
								if (typeof updateFields.password === 'string' && updateFields.password !== '') {
									throw new NodeOperationError(
										this.getNode(),
										'Set either Password or Remove Password, not both',
										{ itemIndex: i },
									);
								}
								// An empty password removes the protection
								params.password = '';
							} else {
								addIfSet(params, 'password', updateFields.password);
							}
							addIfSet(params, 'date_expired', updateFields.dateExpired);
							addIfSet(params, 'date_available', updateFields.dateAvailable);
							if (Object.keys(params).length === 1) {
								throw new NodeOperationError(
									this.getNode(),
									'Please add at least one field to update',
									{ itemIndex: i },
								);
							}
							await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.Sharing',
								'edit',
								params,
							);
							responseData = await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.Sharing',
								'getinfo',
								{ id },
							);
						}
					} else if (resource === 'search') {
						if (operation === 'find') {
							const folderPath = this.getNodeParameter('folderPath', i) as string;
							const pattern = this.getNodeParameter('pattern', i, '') as string;
							const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
							const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
							const options = this.getNodeParameter('options', i, {}) as IDataObject;

							const startParams: IDataObject = { folder_path: [folderPath] };
							addIfSet(startParams, 'pattern', pattern);
							addIfSet(startParams, 'extension', filters.extension);
							addIfSet(startParams, 'filetype', filters.fileType);
							addIfSet(startParams, 'owner', filters.owner);
							addIfSet(startParams, 'group', filters.group);
							if (filters.recursive === false) {
								startParams.recursive = false;
							}
							if (typeof filters.sizeFrom === 'number' && filters.sizeFrom > 0) {
								startParams.size_from = filters.sizeFrom;
							}
							if (typeof filters.sizeTo === 'number' && filters.sizeTo > 0) {
								startParams.size_to = filters.sizeTo;
							}
							for (const [filterKey, paramKey] of [
								['mtimeFrom', 'mtime_from'],
								['mtimeTo', 'mtime_to'],
								['crtimeFrom', 'crtime_from'],
								['crtimeTo', 'crtime_to'],
								['atimeFrom', 'atime_from'],
								['atimeTo', 'atime_to'],
							] as Array<[string, string]>) {
								const value = filters[filterKey] as string | undefined;
								if (value !== undefined && value !== '') {
									startParams[paramKey] = toEpochSeconds.call(this, value, i);
								}
							}

							const start = await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.Search',
								'start',
								startParams,
							);
							const taskid = start.taskid as string;
							try {
								// Poll with limit 0: returns the finished flag without transferring files
								const maxWaitTime = (options.maxWaitTime as number) ?? 60;
								const deadline = Date.now() + maxWaitTime * 1000;
								for (;;) {
									const poll = await synologyApiRequest.call(
										this,
										session,
										'SYNO.FileStation.Search',
										'list',
										{ taskid, limit: 0 },
									);
									if (poll.finished === true) {
										break;
									}
									if (Date.now() >= deadline) {
										try {
											await synologyApiRequest.call(
												this,
												session,
												'SYNO.FileStation.Search',
												'stop',
												{ taskid: [taskid] },
											);
										} catch {
											// Report the timeout, not the cleanup failure
										}
										throw new NodeOperationError(
											this.getNode(),
											`The search did not finish within ${maxWaitTime} seconds`,
											{ itemIndex: i },
										);
									}
									await sleep(1000);
								}
								const listParams: IDataObject = {
									taskid,
									// -1 lists all matches; 0 would list nothing
									limit: returnAll ? -1 : (this.getNodeParameter('limit', i, 50) as number),
								};
								addIfSet(listParams, 'sort_by', options.sortBy);
								addIfSet(listParams, 'sort_direction', options.sortDirection);
								addIfSet(listParams, 'additional', options.additional);
								const result = await synologyApiRequest.call(
									this,
									session,
									'SYNO.FileStation.Search',
									'list',
									listParams,
								);
								responseData = (result.files as IDataObject[]) ?? [];
							} finally {
								// Search results persist in a temporary database on the NAS
								// until they are cleaned up
								try {
									await synologyApiRequest.call(this, session, 'SYNO.FileStation.Search', 'clean', {
										taskid: [taskid],
									});
								} catch {
									// Cleanup failures must not mask the search result
								}
							}
						}
					} else if (resource === 'archive') {
						if (operation === 'compress') {
							const path = this.getNodeParameter('path', i) as string;
							const destinationFilePath = this.getNodeParameter('destinationFilePath', i) as string;
							const options = this.getNodeParameter('options', i, {}) as IDataObject;
							const params: IDataObject = {
								path: [path],
								dest_file_path: destinationFilePath,
							};
							addIfSet(params, 'level', options.level);
							addIfSet(params, 'mode', options.mode);
							addIfSet(params, 'format', options.format);
							addIfSet(params, 'password', options.password);
							const start = await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.Compress',
								'start',
								params,
							);
							const taskid = start.taskid as string;
							if (options.waitForCompletion === false) {
								responseData = { taskid };
							} else {
								responseData = await waitForSynologyTask.call(
									this,
									session,
									'SYNO.FileStation.Compress',
									taskid,
									(options.maxWaitTime as number) ?? 300,
									i,
								);
							}
						} else if (operation === 'extract') {
							const filePath = this.getNodeParameter('filePath', i) as string;
							const destinationFolderPath = this.getNodeParameter(
								'destinationFolderPath',
								i,
							) as string;
							const options = this.getNodeParameter('options', i, {}) as IDataObject;
							const params: IDataObject = {
								file_path: filePath,
								dest_folder_path: destinationFolderPath,
								overwrite: options.overwrite === true,
								keep_dir: options.keepDir !== false,
								create_subfolder: options.createSubfolder === true,
							};
							addIfSet(params, 'password', options.password);
							const start = await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.Extract',
								'start',
								params,
							);
							const taskid = start.taskid as string;
							if (options.waitForCompletion === false) {
								responseData = { taskid };
							} else {
								responseData = await waitForSynologyTask.call(
									this,
									session,
									'SYNO.FileStation.Extract',
									taskid,
									(options.maxWaitTime as number) ?? 300,
									i,
								);
							}
						} else if (operation === 'listContents') {
							const filePath = this.getNodeParameter('filePath', i) as string;
							const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
							const options = this.getNodeParameter('options', i, {}) as IDataObject;
							const params: IDataObject = {
								file_path: filePath,
								// -1 lists all archived files
								limit: returnAll ? -1 : (this.getNodeParameter('limit', i, 50) as number),
							};
							addIfSet(params, 'password', options.password);
							addIfSet(params, 'sort_by', options.sortBy);
							addIfSet(params, 'sort_direction', options.sortDirection);
							const data = await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.Extract',
								'list',
								params,
							);
							responseData = (data.items as IDataObject[]) ?? [];
						}
					} else if (resource === 'utility') {
						if (operation === 'checkPermission') {
							const path = this.getNodeParameter('path', i) as string;
							const fileName = this.getNodeParameter('fileName', i) as string;
							const options = this.getNodeParameter('options', i, {}) as IDataObject;
							const params: IDataObject = {
								path,
								filename: fileName,
								create_only: options.createOnly !== false,
							};
							addIfSet(params, 'overwrite', overwriteToBoolean(options.overwrite));
							try {
								await synologyApiRequest.call(
									this,
									session,
									'SYNO.FileStation.CheckPermission',
									'write',
									params,
								);
								responseData = { writable: true, path, filename: fileName };
							} catch (error) {
								// The API reports "not writable" as an error response, but only
								// genuine permission/path errors mean "not writable" — session or
								// system errors must fail the execution instead of producing a
								// false negative
								const code = dsmErrorCode(error);
								if (code !== undefined && NOT_WRITABLE_CODES.includes(code)) {
									responseData = {
										writable: false,
										path,
										filename: fileName,
										reason: (error as Error).message,
									};
								} else {
									const notAPermissionError = error;
									throw notAPermissionError;
								}
							}
						} else if (operation === 'dirSize') {
							const path = this.getNodeParameter('path', i) as string;
							const options = this.getNodeParameter('options', i, {}) as IDataObject;
							const start = await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.DirSize',
								'start',
								{ path: [path] },
							);
							const status = await waitForSynologyTask.call(
								this,
								session,
								'SYNO.FileStation.DirSize',
								start.taskid as string,
								(options.maxWaitTime as number) ?? 300,
								i,
							);
							responseData = { path, ...status };
						} else if (operation === 'getInfo') {
							responseData = await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.Info',
								'get',
							);
						} else if (operation === 'md5') {
							const path = this.getNodeParameter('path', i) as string;
							const options = this.getNodeParameter('options', i, {}) as IDataObject;
							const start = await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.MD5',
								'start',
								{ file_path: path },
							);
							const status = await waitForSynologyTask.call(
								this,
								session,
								'SYNO.FileStation.MD5',
								start.taskid as string,
								(options.maxWaitTime as number) ?? 300,
								i,
							);
							responseData = { path, md5: status.md5 };
						} else if (operation === 'thumbnail') {
							const path = this.getNodeParameter('path', i) as string;
							const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
							const options = this.getNodeParameter('options', i, {}) as IDataObject;
							const params: IDataObject = { path };
							addIfSet(params, 'size', options.size);
							addIfSet(params, 'rotate', options.rotate);
							const { content, contentType } = await synologyBinaryRequest.call(
								this,
								session,
								'SYNO.FileStation.Thumb',
								'get',
								params,
							);
							const sourceName = fileNameFromPath(path);
							const dotIndex = sourceName.lastIndexOf('.');
							const stem = dotIndex > 0 ? sourceName.slice(0, dotIndex) : sourceName;
							const extension = extensionFromMimeType(contentType) ?? 'jpg';
							const binaryData = await this.helpers.prepareBinaryData(
								content,
								`${stem}_thumbnail.${extension}`,
								contentType,
							);
							returnData.push({
								json: { path, size: (options.size as string) ?? 'small' },
								binary: { [binaryPropertyName]: binaryData },
								pairedItem: { item: i },
							});
							continue;
						}
					} else if (resource === 'favorite') {
						if (operation === 'add') {
							const path = this.getNodeParameter('path', i) as string;
							const name = this.getNodeParameter('name', i) as string;
							const options = this.getNodeParameter('options', i, {}) as IDataObject;
							const params: IDataObject = { path, name };
							addIfSet(params, 'index', options.index);
							await synologyApiRequest.call(this, session, 'SYNO.FileStation.Favorite', 'add', params);
							responseData = { success: true, path, name };
						} else if (operation === 'clearBroken') {
							await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.Favorite',
								'clear_broken',
							);
							responseData = { success: true };
						} else if (operation === 'delete') {
							const path = this.getNodeParameter('path', i) as string;
							await synologyApiRequest.call(this, session, 'SYNO.FileStation.Favorite', 'delete', {
								path,
							});
							responseData = { success: true, path };
						} else if (operation === 'getAll') {
							const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
							const options = this.getNodeParameter('options', i, {}) as IDataObject;
							const params: IDataObject = {
								limit: returnAll ? 0 : (this.getNodeParameter('limit', i, 50) as number),
							};
							addIfSet(params, 'status_filter', options.statusFilter);
							addIfSet(params, 'additional', options.additional);
							const data = await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.Favorite',
								'list',
								params,
							);
							responseData = (data.favorites as IDataObject[]) ?? [];
						} else if (operation === 'update') {
							const path = this.getNodeParameter('path', i) as string;
							const name = this.getNodeParameter('name', i) as string;
							await synologyApiRequest.call(this, session, 'SYNO.FileStation.Favorite', 'edit', {
								path,
								name,
							});
							responseData = { success: true, path, name };
						}
					} else if (resource === 'backgroundTask') {
						if (operation === 'clearFinished') {
							const taskIds = this.getNodeParameter('taskIds', i, '') as string;
							const params: IDataObject = {};
							const ids = taskIds
								.split(',')
								.map((id) => id.trim())
								.filter((id) => id.length > 0);
							if (ids.length > 0) {
								params.taskid = ids;
							}
							await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.BackgroundTask',
								'clear_finished',
								params,
							);
							responseData = { success: true };
						} else if (operation === 'getAll') {
							const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
							const options = this.getNodeParameter('options', i, {}) as IDataObject;
							const params: IDataObject = {
								limit: returnAll ? 0 : (this.getNodeParameter('limit', i, 50) as number),
							};
							addIfSet(params, 'sort_by', options.sortBy);
							addIfSet(params, 'sort_direction', options.sortDirection);
							addIfSet(params, 'api_filter', options.apiFilter);
							const data = await synologyApiRequest.call(
								this,
								session,
								'SYNO.FileStation.BackgroundTask',
								'list',
								params,
							);
							responseData = (data.tasks as IDataObject[]) ?? [];
						}
					}

					if (responseData === undefined) {
						throw new NodeOperationError(
							this.getNode(),
							`The operation "${operation}" is not supported for resource "${resource}"`,
							{ itemIndex: i },
						);
					}

					const executionData = this.helpers.constructExecutionMetaData(
						this.helpers.returnJsonArray(responseData),
						{ itemData: { item: i } },
					);
					returnData.push(...executionData);
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: { error: (error as Error).message },
							pairedItem: { item: i },
						});
						continue;
					}
					if (error instanceof NodeApiError || error instanceof NodeOperationError) {
						const alreadyWrapped = error;
						throw alreadyWrapped;
					}
					throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
				}
			}
		} finally {
			await synologyLogout.call(this, session);
		}

		return [returnData];
	}
}
