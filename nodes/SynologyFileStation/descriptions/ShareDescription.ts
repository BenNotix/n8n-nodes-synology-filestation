import type { INodeProperties } from 'n8n-workflow';

export const shareOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['share'] } },
		options: [
			{
				name: 'Clear Invalid',
				value: 'clearInvalid',
				description: 'Remove all expired and broken sharing links',
				action: 'Clear invalid sharing links',
			},
			{
				name: 'Create',
				value: 'create',
				description: 'Create a public sharing link for a file or folder',
				action: 'Create a sharing link',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a sharing link',
				action: 'Delete a sharing link',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get information about a sharing link',
				action: 'Get a sharing link',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List the sharing links of the account',
				action: 'Get many sharing links',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update the password or dates of a sharing link',
				action: 'Update a sharing link',
			},
		],
		default: 'create',
	},
];

export const shareFields: INodeProperties[] = [
	// ----------------------------------------
	//             share: create
	// ----------------------------------------
	{
		displayName: 'Path',
		name: 'path',
		type: 'string',
		required: true,
		default: '',
		placeholder: '/photo/vacation/img_001.jpg',
		description: 'Path of the file or folder to share, starting with a shared folder',
		displayOptions: { show: { resource: ['share'], operation: ['create'] } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['share'], operation: ['create'] } },
		options: [
			{
				displayName: 'Available From',
				name: 'dateAvailable',
				type: 'string',
				default: '',
				placeholder: 'YYYY-MM-DD',
				description:
					'Date (in the timezone of the NAS) from which the link becomes usable. Leave empty for immediately.',
			},
			{
				displayName: 'Expires On',
				name: 'dateExpired',
				type: 'string',
				default: '',
				placeholder: 'YYYY-MM-DD',
				description:
					'Date (in the timezone of the NAS) at which the link expires. Leave empty for a permanent link.',
			},
			{
				displayName: 'Password',
				name: 'password',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description: 'Password protecting the sharing link (max 16 characters)',
			},
		],
	},

	// ----------------------------------------
	//          share: delete / get
	// ----------------------------------------
	{
		displayName: 'Link ID',
		name: 'id',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'pHTBKQf9',
		description: 'Unique ID of the sharing link (as returned when the link was created)',
		displayOptions: { show: { resource: ['share'], operation: ['delete', 'get', 'update'] } },
	},

	// ----------------------------------------
	//             share: getAll
	// ----------------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['share'], operation: ['getAll'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		displayOptions: { show: { resource: ['share'], operation: ['getAll'], returnAll: [false] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { resource: ['share'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Force Refresh',
				name: 'forceClean',
				type: 'boolean',
				default: false,
				description:
					'Whether to synchronize all sharing statuses instead of reading the faster cache',
			},
			{
				displayName: 'Sort By',
				name: 'sortBy',
				type: 'options',
				options: [
					{ name: 'Available Date', value: 'date_available' },
					{ name: 'Expiration Date', value: 'date_expired' },
					{ name: 'Has Password', value: 'has_password' },
					{ name: 'ID', value: 'id' },
					{ name: 'Is Folder', value: 'isFolder' },
					{ name: 'Link Owner', value: 'link_owner' },
					{ name: 'Name', value: 'name' },
					{ name: 'Path', value: 'path' },
					{ name: 'Status', value: 'status' },
					{ name: 'URL', value: 'url' },
				],
				default: 'name',
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

	// ----------------------------------------
	//             share: update
	// ----------------------------------------
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['share'], operation: ['update'] } },
		options: [
			{
				displayName: 'Available From',
				name: 'dateAvailable',
				type: 'string',
				default: '',
				placeholder: 'YYYY-MM-DD',
				description:
					'Date (in the timezone of the NAS) from which the link becomes usable. Set to 0 to make it usable immediately.',
			},
			{
				displayName: 'Expires On',
				name: 'dateExpired',
				type: 'string',
				default: '',
				placeholder: 'YYYY-MM-DD',
				description:
					'Date (in the timezone of the NAS) at which the link expires. Set to 0 to make the link permanent.',
			},
			{
				displayName: 'Password',
				name: 'password',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description: 'New password of the sharing link (max 16 characters)',
			},
			{
				displayName: 'Remove Password',
				name: 'removePassword',
				type: 'boolean',
				default: false,
				description: 'Whether to remove the password of the sharing link',
			},
		],
	},
];
