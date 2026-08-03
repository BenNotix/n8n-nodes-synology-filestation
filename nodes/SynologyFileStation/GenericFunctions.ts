import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

/**
 * The stream type accepted by n8n's binary helpers, extracted from the helper
 * signature — community nodes may not import Node.js built-in modules, so the
 * `Readable` type cannot come from 'stream' directly.
 */
type Readable = Exclude<Parameters<IExecuteFunctions['helpers']['prepareBinaryData']>[0], Buffer>;

export type SynologyContext = IExecuteFunctions | ILoadOptionsFunctions;

/** Session name File Station APIs must be logged into (per the official API guide). */
const SESSION_NAME = 'FileStation';

const POLL_INTERVAL_MS = 1500;

interface ApiInfoEntry {
	path: string;
	minVersion: number;
	maxVersion: number;
}

export interface SynologySession {
	baseUrl: string;
	sid: string;
	apiInfo: Record<string, ApiInfoEntry>;
	allowUnauthorizedCerts: boolean;
}

/**
 * Version of each API this node is written against. The version actually sent
 * is clamped into the [minVersion, maxVersion] range the NAS reports through
 * SYNO.API.Info, so both DSM 6 and DSM 7 are supported.
 */
const PREFERRED_VERSIONS: Record<string, number> = {
	'SYNO.API.Auth': 6,
	'SYNO.FileStation.Info': 2,
	'SYNO.FileStation.List': 2,
	'SYNO.FileStation.Search': 2,
	'SYNO.FileStation.VirtualFolder': 2,
	'SYNO.FileStation.Favorite': 2,
	'SYNO.FileStation.Thumb': 2,
	'SYNO.FileStation.DirSize': 2,
	'SYNO.FileStation.MD5': 2,
	'SYNO.FileStation.CheckPermission': 3,
	'SYNO.FileStation.Upload': 2,
	'SYNO.FileStation.Download': 2,
	'SYNO.FileStation.Sharing': 3,
	'SYNO.FileStation.CreateFolder': 2,
	'SYNO.FileStation.Rename': 2,
	'SYNO.FileStation.CopyMove': 3,
	'SYNO.FileStation.Delete': 2,
	'SYNO.FileStation.Extract': 2,
	'SYNO.FileStation.Compress': 3,
	'SYNO.FileStation.BackgroundTask': 3,
};

const KNOWN_APIS = Object.keys(PREFERRED_VERSIONS);

/** Common error codes shared by all DSM Web APIs. */
const COMMON_ERRORS: Record<number, string> = {
	100: 'Unknown error',
	101: 'No parameter of API, method or version',
	102: 'The requested API does not exist',
	103: 'The requested method does not exist',
	104: 'The requested version does not support the functionality',
	105: 'The logged in session does not have permission',
	106: 'Session timeout',
	107: 'Session interrupted by duplicated login',
	108: 'Failed to upload the file',
	109: 'The network connection is unstable or the system is busy',
	110: 'The network connection is unstable or the system is busy',
	111: 'The network connection is unstable or the system is busy',
	114: 'Lost parameters for this API',
	115: 'Not allowed to upload a file',
	116: 'Not allowed to perform for a demo site',
	117: 'The network connection is unstable or the system is busy',
	118: 'The network connection is unstable or the system is busy',
	119: 'Invalid session (SID not found)',
	150: 'The request source IP does not match the login IP',
};

/** Error codes of the SYNO.API.Auth login method. */
const AUTH_ERRORS: Record<number, string> = {
	400: 'No such account or incorrect password',
	401: 'Account disabled',
	402: 'Permission denied',
	403: '2-factor authentication code required — use an account without 2FA',
	404: 'Failed to authenticate the 2-factor authentication code',
	406: '2-factor authentication is enforced — use an account without 2FA',
	407: 'Blocked IP source',
	408: 'Expired password cannot change',
	409: 'Expired password',
	410: 'Password must be changed',
};

/** Common error codes of file operations, shared by all File Station APIs. */
const FILE_ERRORS: Record<number, string> = {
	400: 'Invalid parameter of file operation',
	401: 'Unknown error of file operation',
	402: 'System is too busy',
	403: 'The user does not have permission for this file operation',
	404: 'The group does not have permission for this file operation',
	405: 'The user and group do not have permission for this file operation',
	406: "Can't get user/group information from the account server",
	407: 'Operation not permitted',
	408: 'No such file or directory',
	409: 'Unsupported file system',
	410: 'Failed to connect to the internet-based file system (e.g. CIFS)',
	411: 'Read-only file system',
	412: 'Filename too long in the non-encrypted file system',
	413: 'Filename too long in the encrypted file system',
	414: 'File already exists',
	415: 'Disk quota exceeded',
	416: 'No space left on device',
	417: 'Input/output error',
	418: 'Illegal name or path',
	419: 'Illegal file name',
	420: 'Illegal file name on FAT file system',
	421: 'Device or resource busy',
	599: 'No such task of the file operation',
};

/** API-specific error codes, keyed by API name. */
const API_ERRORS: Record<string, Record<number, string>> = {
	'SYNO.FileStation.Favorite': {
		800: 'This folder path is already added to the favorites',
		801: 'The favorite name conflicts with an existing folder path in the favorites',
		802: 'There are too many favorites to be added',
	},
	'SYNO.FileStation.Delete': {
		900: 'Failed to delete file(s)/folder(s)',
	},
	'SYNO.FileStation.CopyMove': {
		1000: 'Failed to copy files/folders',
		1001: 'Failed to move files/folders',
		1002: 'An error occurred at the destination',
		1003: 'Cannot overwrite or skip the existing file because no overwrite behavior was chosen',
		1004: 'A file cannot overwrite a folder with the same name, or vice versa',
		1006: 'Cannot copy/move a file/folder with special characters to a FAT32 file system',
		1007: 'Cannot copy/move a file bigger than 4 GB to a FAT32 file system',
	},
	'SYNO.FileStation.CreateFolder': {
		1100: 'Failed to create the folder',
		1101: 'The number of folders in the parent folder would exceed the system limit',
	},
	'SYNO.FileStation.Rename': {
		1200: 'Failed to rename the file/folder',
	},
	'SYNO.FileStation.Compress': {
		1300: 'Failed to compress files/folders',
		1301: 'Cannot create the archive because the given archive name is too long',
	},
	'SYNO.FileStation.Extract': {
		1400: 'Failed to extract files',
		1401: 'Cannot open the file as an archive',
		1402: 'Failed to read archive data',
		1403: 'Wrong password',
		1404: 'Failed to get the file and folder list of the archive',
		1405: 'Failed to find the item ID in the archive file',
	},
	'SYNO.FileStation.Upload': {
		1800: 'Missing or mismatched Content-Length while uploading',
		1801: 'Upload timed out waiting for data',
		1802: 'No filename information in the last part of the file content',
		1803: 'Upload connection was cancelled',
		1804: 'Failed to upload an oversized file to a FAT file system',
		1805: "Can't overwrite or skip the existing file because no overwrite behavior was chosen",
	},
	'SYNO.FileStation.Sharing': {
		2000: 'Sharing link does not exist',
		2001: 'Cannot generate the sharing link because too many sharing links exist',
		2002: 'Failed to access sharing links',
	},
};

function errorMessageForCode(api: string, code: number): string {
	if (api === 'SYNO.API.Auth' && AUTH_ERRORS[code] !== undefined) {
		return AUTH_ERRORS[code];
	}
	return (
		API_ERRORS[api]?.[code] ??
		COMMON_ERRORS[code] ??
		(api.startsWith('SYNO.FileStation.') ? FILE_ERRORS[code] : undefined) ??
		'Unknown error'
	);
}

/** Message for a SYNO.API.Auth login error code. */
export function authErrorMessage(code: number): string {
	return AUTH_ERRORS[code] ?? COMMON_ERRORS[code] ?? 'Login failed';
}

/**
 * DSM error code carried by an error thrown from `synologyApiRequest`.
 * The `[<api> error <code>]` suffix is generated by `apiError` below, so the
 * format is under our control.
 */
export function dsmErrorCode(error: unknown): number | undefined {
	if (error instanceof NodeApiError) {
		const match = / error (\d+)\]$/.exec(error.message);
		if (match !== null) {
			return Number(match[1]);
		}
	}
	return undefined;
}

/**
 * Build a NodeApiError out of a `{"success": false, "error": {...}}` envelope,
 * including the per-file detail entries when the NAS provides them.
 */
function apiError(this: SynologyContext, api: string, error: IDataObject): NodeApiError {
	const code = error.code as number;
	const message = `${errorMessageForCode(api, code)} [${api} error ${code}]`;
	const details = (error.errors as IDataObject[] | undefined)
		?.map((detail) => {
			const detailCode = detail.code as number | undefined;
			const target = (detail.path ?? detail.name ?? '') as string;
			return detailCode !== undefined
				? `${target}: ${errorMessageForCode(api, detailCode)} (error ${detailCode})`
				: target;
		})
		.join('; ');
	return new NodeApiError(this.getNode(), error as JsonObject, {
		message,
		description: details !== undefined && details !== '' ? details : undefined,
	});
}

/**
 * File Station APIs report `requestFormat: "JSON"`: string parameter values are
 * sent JSON-encoded (double-quoted) and lists as JSON arrays, exactly like the
 * examples of the official API guide. Numbers and booleans stay bare.
 */
function formatParamValue(value: string | string[] | number | boolean): string {
	if (typeof value === 'string' || Array.isArray(value)) {
		return JSON.stringify(value);
	}
	return String(value);
}

function baseRequestOptions(session: SynologySession): Partial<IHttpRequestOptions> {
	return session.allowUnauthorizedCerts ? { skipSslCertificateValidation: true } : {};
}

/**
 * DSM sometimes serves JSON with a text/plain content type, in which case the
 * body arrives as a string instead of a parsed object.
 */
function parseJsonBody(this: SynologyContext, body: unknown): IDataObject {
	if (typeof body === 'string') {
		try {
			return JSON.parse(body) as IDataObject;
		} catch {
			throw new NodeOperationError(
				this.getNode(),
				'The Synology NAS returned a non-JSON response — is the base URL pointing to DSM?',
			);
		}
	}
	return (body ?? {}) as IDataObject;
}

function resolveApi(session: SynologySession, api: string): { path: string; version: number } {
	const info = session.apiInfo[api];
	const preferred = PREFERRED_VERSIONS[api] ?? 1;
	if (info === undefined) {
		// Not reported by SYNO.API.Info — fall back to the DSM 6/7 default entry point
		return { path: 'entry.cgi', version: preferred };
	}
	const version = Math.max(info.minVersion, Math.min(preferred, info.maxVersion));
	return { path: info.path, version };
}

/** Version of an API as it will actually be requested from this NAS. */
export function resolvedApiVersion(session: SynologySession, api: string): number {
	return resolveApi(session, api).version;
}

/**
 * Log into DSM: discover the API paths/versions of this NAS through
 * SYNO.API.Info (its own location is the only fixed one), then create a
 * File Station session and keep the sid.
 */
export async function synologyLogin(this: SynologyContext): Promise<SynologySession> {
	const credentials = await this.getCredentials('synologyApi');
	const baseUrl = (credentials.baseUrl as string).trim().replace(/\/+$/, '');
	const allowUnauthorizedCerts = credentials.ignoreSslIssues === true;
	const session: SynologySession = { baseUrl, sid: '', apiInfo: {}, allowUnauthorizedCerts };

	let infoBody: unknown;
	try {
		// DSM uses session-based authentication: SYNO.API.Auth issues a sid that
		// every later request carries as the _sid parameter. That handshake cannot
		// be expressed as a static credential `authenticate` block, so the generic
		// httpRequestWithAuthentication helper does not apply here.
		// eslint-disable-next-line @n8n/community-nodes/no-http-request-with-manual-auth
		infoBody = await this.helpers.httpRequest({
			method: 'GET',
			url: `${baseUrl}/webapi/query.cgi`,
			qs: {
				api: 'SYNO.API.Info',
				version: 1,
				method: 'query',
				query: KNOWN_APIS.join(','),
			},
			...baseRequestOptions(session),
		});
	} catch (error) {
		throw new NodeOperationError(
			this.getNode(),
			`Could not reach the Synology NAS at ${baseUrl}: ${(error as Error).message}`,
		);
	}
	const info = parseJsonBody.call(this, infoBody);
	if (info.success !== true) {
		throw apiError.call(this, 'SYNO.API.Info', (info.error ?? {}) as IDataObject);
	}
	session.apiInfo = (info.data ?? {}) as Record<string, ApiInfoEntry>;

	const { path, version } = resolveApi(session, 'SYNO.API.Auth');
	// Same reason as above — this call IS the authentication
	// eslint-disable-next-line @n8n/community-nodes/no-http-request-with-manual-auth
	const loginBody = await this.helpers.httpRequest({
		method: 'GET',
		url: `${baseUrl}/webapi/${path}`,
		qs: {
			api: 'SYNO.API.Auth',
			version,
			method: 'login',
			account: credentials.username as string,
			passwd: credentials.password as string,
			session: SESSION_NAME,
			format: 'sid',
		},
		...baseRequestOptions(session),
	});
	const login = parseJsonBody.call(this, loginBody);
	if (login.success !== true) {
		throw apiError.call(this, 'SYNO.API.Auth', (login.error ?? {}) as IDataObject);
	}
	session.sid = (login.data as IDataObject).sid as string;
	return session;
}

/** Best-effort logout — a failure here must never mask the actual result. */
export async function synologyLogout(this: SynologyContext, session: SynologySession): Promise<void> {
	if (session.sid === '') {
		return;
	}
	const { path, version } = resolveApi(session, 'SYNO.API.Auth');
	try {
		await this.helpers.httpRequest({
			method: 'GET',
			url: `${session.baseUrl}/webapi/${path}`,
			qs: {
				api: 'SYNO.API.Auth',
				version,
				method: 'logout',
				session: SESSION_NAME,
				_sid: session.sid,
			},
			...baseRequestOptions(session),
		});
	} catch {
		// The sid expires on its own; nothing useful to do
	}
}

/**
 * Make an authenticated File Station API request and return the `data` object.
 * Params set to undefined/null are dropped ('' is kept — e.g. an empty sharing
 * password means "remove it"); strings and arrays are JSON-encoded per the
 * File Station request format.
 */
export async function synologyApiRequest(
	this: SynologyContext,
	session: SynologySession,
	api: string,
	method: string,
	params: IDataObject = {},
): Promise<IDataObject> {
	const { path, version } = resolveApi(session, api);
	const qs: IDataObject = { api, version, method };
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === null) {
			continue;
		}
		qs[key] = formatParamValue(value as string | string[] | number | boolean);
	}
	qs._sid = session.sid;

	const responseBody = await this.helpers.httpRequest({
		method: 'GET',
		url: `${session.baseUrl}/webapi/${path}`,
		qs,
		...baseRequestOptions(session),
	});
	const body = parseJsonBody.call(this, responseBody);
	if (body.success !== true) {
		throw apiError.call(this, api, (body.error ?? {}) as IDataObject);
	}
	return (body.data ?? {}) as IDataObject;
}

/** Read a (small) stream fully into a string, guarding against runaway sizes. */
async function streamToString(stream: Readable, maxBytes = 4 * 1024 * 1024): Promise<string> {
	const chunks: Buffer[] = [];
	let total = 0;
	for await (const chunk of stream) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
		total += buffer.length;
		if (total > maxBytes) {
			stream.destroy();
			break;
		}
		chunks.push(buffer);
	}
	return Buffer.concat(chunks).toString('utf8');
}

/**
 * Request an endpoint that responds with raw file content (Download, Thumb).
 * The body is returned as a stream so large downloads are not buffered in
 * memory. DSM signals errors either as an HTTP error status (Thumb) or as a
 * JSON envelope served with a JSON/text content type — real file bytes always
 * come with a binary content type (mode=download forces octet-stream), so the
 * content type is a reliable discriminator.
 */
export async function synologyBinaryRequest(
	this: IExecuteFunctions,
	session: SynologySession,
	api: string,
	method: string,
	params: IDataObject = {},
): Promise<{ content: Buffer | Readable; contentType?: string }> {
	const { path, version } = resolveApi(session, api);
	const qs: IDataObject = { api, version, method };
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === null) {
			continue;
		}
		qs[key] = formatParamValue(value as string | string[] | number | boolean);
	}
	qs._sid = session.sid;

	const response = await this.helpers.httpRequest({
		method: 'GET',
		url: `${session.baseUrl}/webapi/${path}`,
		qs,
		encoding: 'stream',
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		...baseRequestOptions(session),
	});
	const headers = (response.headers ?? {}) as IDataObject;
	const contentType = headers['content-type'] as string | undefined;
	const stream = response.body as Readable;
	const statusCode = (response.statusCode as number | undefined) ?? 200;

	if (statusCode >= 400) {
		stream.destroy();
		if (api === 'SYNO.FileStation.Thumb' && statusCode === 404) {
			throw new NodeOperationError(
				this.getNode(),
				'The NAS has no thumbnail for this file — thumbnails only exist for supported image formats, and for videos indexed in the "photo" shared folder or user home folders',
			);
		}
		throw new NodeOperationError(
			this.getNode(),
			`The NAS returned HTTP ${statusCode} for the ${api} request`,
		);
	}

	if (contentType !== undefined && /^(application\/json|text\/plain)/.test(contentType)) {
		const text = await streamToString(stream);
		let parsed: IDataObject | undefined;
		try {
			parsed = JSON.parse(text) as IDataObject;
		} catch {
			parsed = undefined;
		}
		if (parsed !== undefined && parsed.success === false && parsed.error !== undefined) {
			throw apiError.call(this, api, parsed.error as IDataObject);
		}
		// Not an error envelope after all — hand the bytes through
		return { content: Buffer.from(text, 'utf8'), contentType };
	}

	return { content: stream, contentType };
}

/**
 * Upload a file with SYNO.FileStation.Upload as RFC 1867 multipart/form-data.
 * Every parameter travels as its own part and the binary file part must come
 * last — the multipart body is built by hand to guarantee that ordering.
 */
export async function synologyUploadRequest(
	this: IExecuteFunctions,
	session: SynologySession,
	params: IDataObject,
	file: { name: string; content: Buffer; mimeType: string },
): Promise<IDataObject> {
	const api = 'SYNO.FileStation.Upload';
	const { path, version } = resolveApi(session, api);

	const boundary = `----n8nSynologyBoundary${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
	const parts: Buffer[] = [];
	const fields: IDataObject = { api, version, method: 'upload', ...params };
	for (const [key, value] of Object.entries(fields)) {
		if (value === undefined || value === null || value === '') {
			continue;
		}
		parts.push(
			Buffer.from(
				`--${boundary}\r\ncontent-disposition: form-data; name="${key}"\r\n\r\n${String(value)}\r\n`,
				'utf8',
			),
		);
	}
	// Control characters or quotes in the filename would corrupt the part header
	const safeFileName = file.name.replace(/[\r\n]+/g, ' ').replace(/"/g, "'");
	parts.push(
		Buffer.from(
			`--${boundary}\r\ncontent-disposition: form-data; name="file"; filename="${safeFileName}"\r\n` +
				`Content-Type: ${file.mimeType}\r\n\r\n`,
			'utf8',
		),
	);
	parts.push(file.content);
	parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));
	const body = Buffer.concat(parts);

	const responseBody = await this.helpers.httpRequest({
		method: 'POST',
		url: `${session.baseUrl}/webapi/${path}`,
		qs: { _sid: session.sid },
		headers: {
			'Content-Type': `multipart/form-data; boundary=${boundary}`,
			'Content-Length': body.length,
		},
		body,
		...baseRequestOptions(session),
	});
	const parsed = parseJsonBody.call(this, responseBody);
	if (parsed.success !== true) {
		throw apiError.call(this, api, (parsed.error ?? {}) as IDataObject);
	}
	return (parsed.data ?? {}) as IDataObject;
}

/**
 * Poll a non-blocking task (CopyMove, Delete, Extract, Compress, DirSize, MD5)
 * until its `status` method reports finished, and return the final status.
 * On timeout the task is stopped on the NAS before throwing.
 */
export async function waitForSynologyTask(
	this: IExecuteFunctions,
	session: SynologySession,
	api: string,
	taskid: string,
	maxWaitTime: number,
	itemIndex: number,
): Promise<IDataObject> {
	const deadline = Date.now() + maxWaitTime * 1000;
	for (;;) {
		const status = await synologyApiRequest.call(this, session, api, 'status', { taskid });
		if (status.finished === true) {
			return status;
		}
		if (Date.now() >= deadline) {
			try {
				await synologyApiRequest.call(this, session, api, 'stop', { taskid });
			} catch {
				// Report the timeout, not the cleanup failure
			}
			throw new NodeOperationError(
				this.getNode(),
				`The ${api.split('.').pop()} task did not finish within ${maxWaitTime} seconds (task ${taskid} was stopped)`,
				{ itemIndex },
			);
		}
		await sleep(POLL_INTERVAL_MS);
	}
}

/**
 * Message for a per-file error code, as returned inside the `files`/`folders`
 * arrays of getinfo/create/rename responses.
 */
export function fileErrorMessage(code: number): string {
	return FILE_ERRORS[code] ?? COMMON_ERRORS[code] ?? 'Unknown error';
}

/** Basename of a File Station path, for naming downloaded binaries. */
export function fileNameFromPath(path: string): string {
	const cleaned = path.replace(/\/+$/, '');
	const name = cleaned.slice(cleaned.lastIndexOf('/') + 1);
	return name === '' ? 'file' : name;
}

/** Convert an n8n dateTime parameter value to a Linux timestamp in seconds. */
export function toEpochSeconds(this: IExecuteFunctions, value: string, itemIndex: number): number {
	const ms = Date.parse(value);
	if (Number.isNaN(ms)) {
		throw new NodeOperationError(this.getNode(), `"${value}" is not a valid date`, { itemIndex });
	}
	return Math.floor(ms / 1000);
}
