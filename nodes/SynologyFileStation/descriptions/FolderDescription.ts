import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import { fileAdditionalOptions } from './FileDescription';

const sortByOptions: INodePropertyOptions[] = [
	{ name: 'Access Time', value: 'atime' },
	{ name: 'Change Time', value: 'ctime' },
	{ name: 'Created Time', value: 'crtime' },
	{ name: 'Extension', value: 'type' },
	{ name: 'Group', value: 'group' },
	{ name: 'Modified Time', value: 'mtime' },
	{ name: 'Name', value: 'name' },
	{ name: 'Owner', value: 'user' },
	{ name: 'POSIX Permissions', value: 'posix' },
	{ name: 'Size', value: 'size' },
];

const sortDirection: INodeProperties = {
	displayName: 'Sort Direction',
	name: 'sortDirection',
	type: 'options',
	options: [
		{ name: 'Ascending', value: 'asc' },
		{ name: 'Descending', value: 'desc' },
	],
	default: 'asc',
};

export const folderOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['folder'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a new folder',
				action: 'Create a folder',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a folder and its contents',
				action: 'Delete a folder',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List the files and folders inside a folder',
				action: 'Get many folder contents',
			},
			{
				name: 'List Shares',
				value: 'listShares',
				description: 'List all shared folders visible to the account',
				action: 'List shared folders',
			},
		],
		default: 'getAll',
	},
];

export const folderFields: INodeProperties[] = [
	// ----------------------------------------
	//             folder: create
	// ----------------------------------------
	{
		displayName: 'Parent Folder',
		name: 'folderPath',
		type: 'string',
		required: true,
		default: '',
		placeholder: '/photo',
		description: 'Path of the folder the new folder is created in, starting with a shared folder',
		displayOptions: { show: { resource: ['folder'], operation: ['create'] } },
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'new-folder',
		description: 'Name of the new folder',
		displayOptions: { show: { resource: ['folder'], operation: ['create'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { resource: ['folder'], operation: ['create'] } },
		options: [
			{
				displayName: 'Additional Fields',
				name: 'additional',
				type: 'multiOptions',
				// CreateFolder supports the getinfo additional options except mount_point_type
				options: fileAdditionalOptions.filter((option) => option.value !== 'mount_point_type'),
				default: [],
				description: 'Extra folder information to include in the response',
			},
			{
				displayName: 'Create Parent Folders',
				name: 'forceParent',
				type: 'boolean',
				default: true,
				description:
					'Whether to create missing parent folders and ignore an already existing folder',
			},
		],
	},

	// ----------------------------------------
	//             folder: delete
	// ----------------------------------------
	{
		displayName: 'Path',
		name: 'path',
		type: 'string',
		required: true,
		default: '',
		placeholder: '/photo/old-folder',
		description: 'Path of the folder to delete, starting with a shared folder',
		displayOptions: { show: { resource: ['folder'], operation: ['delete'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { resource: ['folder'], operation: ['delete'] } },
		options: [
			{
				displayName: 'Max Wait Time',
				name: 'maxWaitTime',
				type: 'number',
				default: 300,
				typeOptions: { minValue: 1 },
				description:
					'Maximum time in seconds to wait for the deletion to finish before stopping it and failing',
			},
			{
				displayName: 'Recursive',
				name: 'recursive',
				type: 'boolean',
				default: true,
				description:
					'Whether to delete all files within the folder recursively. When disabled, deleting a non-empty folder fails.',
			},
			{
				displayName: 'Wait for Completion',
				name: 'waitForCompletion',
				type: 'boolean',
				default: true,
				description:
					'Whether to wait until the NAS has finished the deletion. If disabled, the task ID is returned instead — track it with the Background Task resource.',
			},
		],
	},

	// ----------------------------------------
	//             folder: getAll
	// ----------------------------------------
	{
		displayName: 'Folder Path',
		name: 'folderPath',
		type: 'string',
		required: true,
		default: '',
		placeholder: '/photo/vacation',
		description: 'Path of the folder to list, starting with a shared folder',
		displayOptions: { show: { resource: ['folder'], operation: ['getAll'] } },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['folder'], operation: ['getAll', 'listShares'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		displayOptions: {
			show: { resource: ['folder'], operation: ['getAll', 'listShares'], returnAll: [false] },
		},
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { resource: ['folder'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Additional Fields',
				name: 'additional',
				type: 'multiOptions',
				options: fileAdditionalOptions,
				default: [],
				description: 'Extra file information to include in the response',
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
				default: 'all',
			},
			{
				displayName: 'Pattern',
				name: 'pattern',
				type: 'string',
				default: '',
				placeholder: '*.jpg',
				description:
					'Case-insensitive glob pattern the file names must match. Multiple patterns can be separated by commas. Without glob characters (* or ?) the pattern matches partially.',
			},
			{
				displayName: 'Sort By',
				name: 'sortBy',
				type: 'options',
				options: sortByOptions,
				default: 'name',
			},
			sortDirection,
		],
	},

	// ----------------------------------------
	//           folder: listShares
	// ----------------------------------------
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { resource: ['folder'], operation: ['listShares'] } },
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
					{ name: 'Volume Status', value: 'volume_status' },
				],
				default: [],
				description: 'Extra shared-folder information to include in the response',
			},
			{
				displayName: 'Only Writable',
				name: 'onlyWritable',
				type: 'boolean',
				default: false,
				description: 'Whether to list only writable shared folders',
			},
			{
				displayName: 'Sort By',
				name: 'sortBy',
				type: 'options',
				options: sortByOptions.filter(
					(option) => option.value !== 'size' && option.value !== 'type',
				),
				default: 'name',
			},
			sortDirection,
		],
	},
];
