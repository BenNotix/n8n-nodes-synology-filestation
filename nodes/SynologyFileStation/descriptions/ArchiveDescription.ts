import type { INodeProperties } from 'n8n-workflow';

const maxWaitTimeOption: INodeProperties = {
	displayName: 'Max Wait Time',
	name: 'maxWaitTime',
	type: 'number',
	default: 300,
	typeOptions: { minValue: 1 },
	description:
		'Maximum time in seconds to wait for the task to finish before stopping it and failing',
};

const waitForCompletionOption: INodeProperties = {
	displayName: 'Wait for Completion',
	name: 'waitForCompletion',
	type: 'boolean',
	default: true,
	description:
		'Whether to wait until the NAS has finished the task. If disabled, the task ID is returned instead — track it with the Background Task resource.',
};

export const archiveOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['archive'] } },
		options: [
			{
				name: 'Compress',
				value: 'compress',
				description: 'Compress a file or folder into an archive',
				action: 'Compress into an archive',
			},
			{
				name: 'Extract',
				value: 'extract',
				description: 'Extract an archive into a folder',
				action: 'Extract an archive',
			},
			{
				name: 'List Contents',
				value: 'listContents',
				description: 'List the files contained in an archive',
				action: 'List archive contents',
			},
		],
		default: 'extract',
	},
];

export const archiveFields: INodeProperties[] = [
	// ----------------------------------------
	//            archive: compress
	// ----------------------------------------
	{
		displayName: 'Source Path',
		name: 'path',
		type: 'string',
		required: true,
		default: '',
		placeholder: '/photo/vacation',
		description: 'Path of the file or folder to compress, starting with a shared folder',
		displayOptions: { show: { resource: ['archive'], operation: ['compress'] } },
	},
	{
		displayName: 'Destination File',
		name: 'destinationFilePath',
		type: 'string',
		required: true,
		default: '',
		placeholder: '/backup/vacation.zip',
		description: 'Path (including the file name) of the archive to create',
		displayOptions: { show: { resource: ['archive'], operation: ['compress'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { resource: ['archive'], operation: ['compress'] } },
		options: [
			{
				displayName: 'Compression Level',
				name: 'level',
				type: 'options',
				options: [
					{ name: 'Best', value: 'best', description: 'Slowest speed, optimal compression' },
					{ name: 'Fastest', value: 'fastest', description: 'Fastest speed, less compression' },
					{ name: 'Moderate', value: 'moderate', description: 'Normal speed and compression' },
					{ name: 'Store', value: 'store', description: 'Pack files without compressing' },
				],
				default: 'moderate',
			},
			{
				displayName: 'Format',
				name: 'format',
				type: 'options',
				options: [
					{ name: '7z', value: '7z' },
					{ name: 'ZIP', value: 'zip' },
				],
				default: 'zip',
			},
			maxWaitTimeOption,
			{
				displayName: 'Mode',
				name: 'mode',
				type: 'options',
				options: [
					{
						name: 'Add',
						value: 'add',
						description: 'Update existing items and add new files',
					},
					{
						name: 'Refresh',
						value: 'refreshen',
						description: 'Only update existing items that are newer on the file system',
					},
					{
						name: 'Synchronize',
						value: 'synchronize',
						description: 'Update older files in the archive and add missing files',
					},
					{
						name: 'Update',
						value: 'update',
						description: 'Update existing items if newer on the file system and add new files',
					},
				],
				default: 'add',
			},
			{
				displayName: 'Password',
				name: 'password',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description: 'Password protecting the archive',
			},
			waitForCompletionOption,
		],
	},

	// ----------------------------------------
	//            archive: extract
	// ----------------------------------------
	{
		displayName: 'Archive Path',
		name: 'filePath',
		type: 'string',
		required: true,
		default: '',
		placeholder: '/download/archive.zip',
		description:
			'Path of the archive to extract, starting with a shared folder. Supported formats: zip, gz, tar, tgz, tbz, bz2, rar, 7z, iso.',
		displayOptions: { show: { resource: ['archive'], operation: ['extract'] } },
	},
	{
		displayName: 'Destination Folder',
		name: 'destinationFolderPath',
		type: 'string',
		required: true,
		default: '',
		placeholder: '/download/extracted',
		description: 'Path of the folder the archive is extracted into',
		displayOptions: { show: { resource: ['archive'], operation: ['extract'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { resource: ['archive'], operation: ['extract'] } },
		options: [
			{
				displayName: 'Create Subfolder',
				name: 'createSubfolder',
				type: 'boolean',
				default: false,
				description: 'Whether to extract into a subfolder named after the archive',
			},
			{
				displayName: 'Keep Folder Structure',
				name: 'keepDir',
				type: 'boolean',
				default: true,
				description: 'Whether to keep the folder structure of the archive',
			},
			maxWaitTimeOption,
			{
				displayName: 'Overwrite',
				name: 'overwrite',
				type: 'boolean',
				default: false,
				description: 'Whether to overwrite files that already exist in the destination folder',
			},
			{
				displayName: 'Password',
				name: 'password',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description: 'Password of the archive, if it is protected',
			},
			waitForCompletionOption,
		],
	},

	// ----------------------------------------
	//          archive: listContents
	// ----------------------------------------
	{
		displayName: 'Archive Path',
		name: 'filePath',
		type: 'string',
		required: true,
		default: '',
		placeholder: '/download/archive.zip',
		description: 'Path of the archive to inspect, starting with a shared folder',
		displayOptions: { show: { resource: ['archive'], operation: ['listContents'] } },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['archive'], operation: ['listContents'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		displayOptions: {
			show: { resource: ['archive'], operation: ['listContents'], returnAll: [false] },
		},
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { resource: ['archive'], operation: ['listContents'] } },
		options: [
			{
				displayName: 'Password',
				name: 'password',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description: 'Password of the archive, if it is protected',
			},
			{
				displayName: 'Sort By',
				name: 'sortBy',
				type: 'options',
				options: [
					{ name: 'Modified Time', value: 'mtime' },
					{ name: 'Name', value: 'name' },
					{ name: 'Packed Size', value: 'pack_size' },
					{ name: 'Size', value: 'size' },
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
];
