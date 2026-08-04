import type { INodeProperties } from 'n8n-workflow';

export const connectionOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['connection'] } },
		options: [
			{
				name: 'Delete',
				value: 'delete',
				description:
					'Unlink the connection from its cloud provider (synced files stay on both sides)',
				action: 'Delete a connection',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get the settings and cloud information of a connection',
				action: 'Get a connection',
			},
			{
				name: 'Get Logs',
				value: 'getLogs',
				description: 'Get the sync history log entries of a connection',
				action: 'Get connection logs',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List the cloud connections and their sync status',
				action: 'Get many connections',
			},
			{
				name: 'Pause',
				value: 'pause',
				description: 'Pause the synchronization of one or all connections',
				action: 'Pause a connection',
			},
			{
				name: 'Resume',
				value: 'resume',
				description: 'Resume the synchronization of one or all connections',
				action: 'Resume a connection',
			},
		],
		default: 'getAll',
	},
];

export const connectionFields: INodeProperties[] = [
	// ----------------------------------------
	//        connection: pause / resume
	// ----------------------------------------
	{
		displayName: 'All Connections',
		name: 'allConnections',
		type: 'boolean',
		default: false,
		description: 'Whether to apply to every connection instead of a single one',
		displayOptions: { show: { resource: ['connection'], operation: ['pause', 'resume'] } },
	},

	// ----------------------------------------
	//   connection: delete / get / getLogs
	//   (+ pause / resume for a single one)
	// ----------------------------------------
	{
		displayName: 'Connection ID',
		name: 'connectionId',
		type: 'number',
		required: true,
		default: 0,
		description: 'ID of the cloud connection, as returned by the Get Many operation',
		displayOptions: {
			show: { resource: ['connection'], operation: ['delete', 'get', 'getLogs'] },
		},
	},
	{
		displayName: 'Connection ID',
		name: 'connectionId',
		type: 'number',
		required: true,
		default: 0,
		description: 'ID of the cloud connection, as returned by the Get Many operation',
		displayOptions: {
			show: { resource: ['connection'], operation: ['pause', 'resume'], allConnections: [false] },
		},
	},

	// ----------------------------------------
	//           connection: getAll
	// ----------------------------------------
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { resource: ['connection'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Group By',
				name: 'groupBy',
				type: 'options',
				options: [
					{ name: 'Cloud Type', value: 'group_by_cloud_type' },
					{ name: 'User', value: 'group_by_user' },
				],
				default: 'group_by_user',
			},
		],
	},

	// ----------------------------------------
	//           connection: getLogs
	// ----------------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['connection'], operation: ['getLogs'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		displayOptions: {
			show: { resource: ['connection'], operation: ['getLogs'], returnAll: [false] },
		},
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['connection'], operation: ['getLogs'] } },
		options: [
			{
				displayName: 'Action',
				name: 'action',
				type: 'options',
				options: [
					{ name: 'All', value: -1 },
					{ name: 'Delete Local', value: 3 },
					{ name: 'Delete Remote', value: 0 },
					{ name: 'Download', value: 1 },
					{ name: 'Merge', value: 8 },
					{ name: 'Merge Deletion', value: 9 },
					{ name: 'Rename Remote', value: 4 },
					{ name: 'Upload', value: 2 },
				],
				default: -1,
				description: 'Only log entries of this sync action',
			},
			{
				displayName: 'After',
				name: 'dateFrom',
				type: 'dateTime',
				default: '',
				description: 'Only log entries after this date',
			},
			{
				displayName: 'Before',
				name: 'dateTo',
				type: 'dateTime',
				default: '',
				description: 'Only log entries before this date',
			},
			{
				displayName: 'Keyword',
				name: 'keyword',
				type: 'string',
				default: '',
				description: 'Only log entries matching this keyword (file name or path)',
			},
			{
				displayName: 'Level',
				name: 'logLevel',
				type: 'options',
				options: [
					{ name: 'All', value: -1 },
					{ name: 'Error', value: 2 },
					{ name: 'Info', value: 0 },
					{ name: 'Warning', value: 1 },
				],
				default: -1,
				description: 'Only log entries of this severity',
			},
		],
	},
];
