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
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import type { SynologySession } from '../SynologyFileStation/GenericFunctions';
import {
	requireSynologyApi,
	synologyApiRequest,
	synologyLogin,
	synologyLogout,
	testSynologyCredential,
	toEpochSeconds,
} from '../SynologyFileStation/GenericFunctions';
import { connectionFields, connectionOperations } from './descriptions/ConnectionDescription';
import { reportFields, reportOperations } from './descriptions/ReportDescription';
import { taskFields, taskOperations } from './descriptions/TaskDescription';

const CLOUD_SYNC_MISSING =
	'Cloud Sync is not available on this NAS — install the Cloud Sync package from the DSM Package Center, and make sure the account is allowed to use it';

/**
 * Read a connection/task ID, coercing expression or AI-agent supplied strings
 * and rejecting the unset default — 0 is never a legitimate Cloud Sync ID, and
 * letting it through would target a wrong object on destructive operations.
 */
function getPositiveId(
	this: IExecuteFunctions,
	parameterName: string,
	displayName: string,
	itemIndex: number,
): number {
	const value = Number(this.getNodeParameter(parameterName, itemIndex));
	if (!Number.isInteger(value) || value <= 0) {
		throw new NodeOperationError(
			this.getNode(),
			`"${displayName}" must be a positive ID — find it with the Get Many operation`,
			{ itemIndex },
		);
	}
	return value;
}

/** The log API pages at most this many entries per request. */
const LOG_PAGE_SIZE = 200;

export class SynologyCloudSync implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Synology Cloud Sync',
		name: 'synologyCloudSync',
		icon: { light: 'file:../../icons/synology.svg', dark: 'file:../../icons/synology.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Monitor and control the Cloud Sync connections of a Synology NAS (Google Drive, Dropbox, OneDrive, S3…)',
		defaults: {
			name: 'Synology Cloud Sync',
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
				displayName:
					'Cloud Sync has no official API documentation — this node relies on the same reverse-engineered endpoints the DSM web UI uses. Most operations require an account with access to the Cloud Sync application.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Connection',
						value: 'connection',
						description:
							'The cloud provider connections: list them with their sync status, pause/resume, read their logs',
					},
					{
						name: 'Report',
						value: 'report',
						description: 'Package configuration and recently synchronized files',
					},
					{
						name: 'Task',
						value: 'task',
						description: 'The folder pairs synchronized by a connection',
					},
				],
				default: 'connection',
			},
			...connectionOperations,
			...connectionFields,
			...reportOperations,
			...reportFields,
			...taskOperations,
			...taskFields,
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

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0);
		const operation = this.getNodeParameter('operation', 0);

		const session: SynologySession = await synologyLogin.call(this);

		try {
			requireSynologyApi.call(this, session, 'SYNO.CloudSync', CLOUD_SYNC_MISSING);

			for (let i = 0; i < items.length; i++) {
				try {
					let responseData: IDataObject | IDataObject[] | undefined;

					if (resource === 'connection') {
						if (operation === 'delete') {
							const connectionId = getPositiveId.call(this, 'connectionId', 'Connection ID', i);
							await synologyApiRequest.call(this, session, 'SYNO.CloudSync', 'unlink_connection', {
								connection_id: connectionId,
							});
							responseData = { success: true, connectionId };
						} else if (operation === 'get') {
							const connectionId = getPositiveId.call(this, 'connectionId', 'Connection ID', i);
							const settings = await synologyApiRequest.call(
								this,
								session,
								'SYNO.CloudSync',
								'get_connection_setting',
								{ connection_id: connectionId },
							);
							const information = await synologyApiRequest.call(
								this,
								session,
								'SYNO.CloudSync',
								'get_property',
								{ connection_id: connectionId },
							);
							responseData = { connectionId, settings, information };
						} else if (operation === 'getAll') {
							const options = this.getNodeParameter('options', i, {}) as IDataObject;
							const data = await synologyApiRequest.call(this, session, 'SYNO.CloudSync', 'list_conn', {
								is_tray: false,
								group_by: (options.groupBy as string) ?? 'group_by_user',
							});
							responseData = (data.conn as IDataObject[]) ?? [];
						} else if (operation === 'getLogs') {
							const connectionId = getPositiveId.call(this, 'connectionId', 'Connection ID', i);
							const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
							const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
							const wanted = returnAll
								? Number.POSITIVE_INFINITY
								: (this.getNodeParameter('limit', i, 50) as number);

							const baseParams: IDataObject = { connection_id: connectionId };
							if (typeof filters.keyword === 'string' && filters.keyword !== '') {
								baseParams.keyword = filters.keyword;
							}
							if (typeof filters.dateFrom === 'string' && filters.dateFrom !== '') {
								baseParams.date_from = toEpochSeconds.call(this, filters.dateFrom, i);
							}
							if (typeof filters.dateTo === 'string' && filters.dateTo !== '') {
								baseParams.date_to = toEpochSeconds.call(this, filters.dateTo, i);
							}
							const logLevel = Number(filters.logLevel);
							if (Number.isFinite(logLevel) && logLevel !== -1) {
								baseParams.log_level = logLevel;
							}
							const action = Number(filters.action);
							if (Number.isFinite(action) && action !== -1) {
								baseParams.action = action;
							}

							const logs: IDataObject[] = [];
							let offset = 0;
							for (;;) {
								const pageSize = Math.min(LOG_PAGE_SIZE, wanted - logs.length);
								const page = await synologyApiRequest.call(this, session, 'SYNO.CloudSync', 'get_log', {
									...baseParams,
									offset,
									limit: pageSize,
								});
								const entries = (page.items as IDataObject[]) ?? [];
								logs.push(...entries);
								offset += entries.length;
								const total = Number(page.total);
								// The NAS may serve fewer entries than requested — keep going
								// until the reported total is reached; without a usable total,
								// the empty-page guard terminates the loop
								const knownTotal = Number.isFinite(total) ? total : Number.POSITIVE_INFINITY;
								if (logs.length >= wanted || entries.length === 0 || offset >= knownTotal) {
									break;
								}
							}
							responseData = returnAll ? logs : logs.slice(0, wanted as number);
						} else if (operation === 'pause' || operation === 'resume') {
							const allConnections = this.getNodeParameter('allConnections', i, false) as boolean;
							const params: IDataObject = {};
							if (!allConnections) {
								params.connection_id = getPositiveId.call(this, 'connectionId', 'Connection ID', i);
							}
							await synologyApiRequest.call(this, session, 'SYNO.CloudSync', operation, params);
							responseData = allConnections
								? { success: true, all: true }
								: { success: true, connectionId: params.connection_id };
						}
					} else if (resource === 'report') {
						if (operation === 'getConfig') {
							responseData = await synologyApiRequest.call(
								this,
								session,
								'SYNO.CloudSync',
								'get_config',
							);
						} else if (operation === 'getRecentlyChanged') {
							responseData = await synologyApiRequest.call(
								this,
								session,
								'SYNO.CloudSync',
								'get_recently_change',
							);
						}
					} else if (resource === 'task') {
						if (operation === 'delete') {
							const connectionId = getPositiveId.call(this, 'connectionId', 'Connection ID', i);
							const sessionId = getPositiveId.call(this, 'sessionId', 'Task ID', i);
							await synologyApiRequest.call(this, session, 'SYNO.CloudSync', 'unlink_session', {
								connection_id: connectionId,
								session_id: sessionId,
							});
							responseData = { success: true, connectionId, sessionId };
						} else if (operation === 'getAll') {
							const connectionId = getPositiveId.call(this, 'connectionId', 'Connection ID', i);
							const data = await synologyApiRequest.call(this, session, 'SYNO.CloudSync', 'list_sess', {
								connection_id: connectionId,
							});
							responseData = (data.sess as IDataObject[]) ?? [];
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
