import type { INodeProperties } from 'n8n-workflow';

export const favoriteOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['favorite'] } },
		options: [
			{
				name: 'Add',
				value: 'add',
				description: "Add a folder to the account's favorites",
				action: 'Add a favorite',
			},
			{
				name: 'Clear Broken',
				value: 'clearBroken',
				description: 'Delete all favorites whose target folder no longer exists',
				action: 'Clear broken favorites',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Remove a folder from the favorites',
				action: 'Delete a favorite',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: "List the account's favorites",
				action: 'Get many favorites',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Rename a favorite',
				action: 'Update a favorite',
			},
		],
		default: 'getAll',
	},
];

export const favoriteFields: INodeProperties[] = [
	// ----------------------------------------
	//       favorite: add / delete / update
	// ----------------------------------------
	{
		displayName: 'Folder Path',
		name: 'path',
		type: 'string',
		required: true,
		default: '',
		placeholder: '/photo/vacation',
		description: 'Path of the favorite folder, starting with a shared folder',
		displayOptions: { show: { resource: ['favorite'], operation: ['add', 'delete', 'update'] } },
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'My vacation photos',
		description: 'Name of the favorite',
		displayOptions: { show: { resource: ['favorite'], operation: ['add', 'update'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { resource: ['favorite'], operation: ['add'] } },
		options: [
			{
				displayName: 'Index',
				name: 'index',
				type: 'number',
				default: -1,
				description:
					'Position of the favorite in the list (0-based). -1 appends it at the end.',
			},
		],
	},

	// ----------------------------------------
	//            favorite: getAll
	// ----------------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['favorite'], operation: ['getAll'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		displayOptions: { show: { resource: ['favorite'], operation: ['getAll'], returnAll: [false] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { resource: ['favorite'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Additional Fields',
				name: 'additional',
				type: 'multiOptions',
				options: [
					{ name: 'Mount Point Type', value: 'mount_point_type' },
					{ name: 'Owner', value: 'owner' },
					{ name: 'Permissions', value: 'perm' },
					{ name: 'Real Path', value: 'real_path' },
					{ name: 'Time', value: 'time' },
				],
				default: [],
				description: 'Extra information about the target folders to include in the response',
			},
			{
				displayName: 'Status Filter',
				name: 'statusFilter',
				type: 'options',
				options: [
					{ name: 'All', value: 'all' },
					{
						name: 'Broken',
						value: 'broken',
						description: 'Favorites whose target folder no longer exists or is not accessible',
					},
					{ name: 'Valid', value: 'valid', description: 'Favorites whose target folder exists' },
				],
				default: 'all',
			},
		],
	},
];
