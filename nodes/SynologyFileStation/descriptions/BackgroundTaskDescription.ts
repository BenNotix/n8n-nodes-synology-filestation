import type { INodeProperties } from 'n8n-workflow';

export const backgroundTaskOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['backgroundTask'] } },
		options: [
			{
				name: 'Clear Finished',
				value: 'clearFinished',
				description: 'Delete finished background tasks from the task list',
				action: 'Clear finished background tasks',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description:
					'List background tasks (copy, move, delete, compress and extract) and their progress',
				action: 'Get many background tasks',
			},
		],
		default: 'getAll',
	},
];

export const backgroundTaskFields: INodeProperties[] = [
	// ----------------------------------------
	//       backgroundTask: clearFinished
	// ----------------------------------------
	{
		displayName: 'Task IDs',
		name: 'taskIds',
		type: 'string',
		default: '',
		placeholder: 'FileStation_51D00B7912CDE0B0',
		description:
			'Comma-separated IDs of the finished tasks to clear. Leave empty to clear all finished tasks.',
		displayOptions: { show: { resource: ['backgroundTask'], operation: ['clearFinished'] } },
	},

	// ----------------------------------------
	//         backgroundTask: getAll
	// ----------------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['backgroundTask'], operation: ['getAll'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		displayOptions: {
			show: { resource: ['backgroundTask'], operation: ['getAll'], returnAll: [false] },
		},
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { resource: ['backgroundTask'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'API Filter',
				name: 'apiFilter',
				type: 'multiOptions',
				options: [
					{ name: 'Compress', value: 'SYNO.FileStation.Compress' },
					{ name: 'Copy/Move', value: 'SYNO.FileStation.CopyMove' },
					{ name: 'Delete', value: 'SYNO.FileStation.Delete' },
					{ name: 'Extract', value: 'SYNO.FileStation.Extract' },
				],
				default: [],
				description: 'Only list background tasks of the given operation types',
			},
			{
				displayName: 'Sort By',
				name: 'sortBy',
				type: 'options',
				options: [
					{ name: 'Creation Time', value: 'crtime' },
					{ name: 'Finished', value: 'finished' },
				],
				default: 'crtime',
			},
			{
				displayName: 'Sort Direction',
				name: 'sortDirection',
				type: 'options',
				options: [
					{ name: 'Ascending', value: 'asc' },
					{ name: 'Descending', value: 'desc' },
				],
				default: 'asc',
			},
		],
	},
];
