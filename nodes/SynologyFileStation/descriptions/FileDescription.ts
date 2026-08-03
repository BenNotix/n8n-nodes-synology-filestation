import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

/** `additional` options supported by List getinfo / list responses. */
export const fileAdditionalOptions: INodePropertyOptions[] = [
	{ name: 'Mount Point Type', value: 'mount_point_type' },
	{ name: 'Owner', value: 'owner' },
	{ name: 'Permissions', value: 'perm' },
	{ name: 'Real Path', value: 'real_path' },
	{ name: 'Size', value: 'size' },
	{ name: 'Time', value: 'time' },
	{ name: 'Type', value: 'type' },
];

const overwriteBehavior: INodeProperties = {
	displayName: 'If Target Exists',
	name: 'overwrite',
	type: 'options',
	options: [
		{
			name: 'Fail',
			value: 'error',
			description: 'The operation fails when a file with the same name already exists',
		},
		{
			name: 'Overwrite',
			value: 'overwrite',
			description: 'Overwrite the existing file',
		},
		{
			name: 'Skip',
			value: 'skip',
			description: 'Keep the existing file and skip this one',
		},
	],
	default: 'error',
};

const waitForCompletion: INodeProperties = {
	displayName: 'Wait for Completion',
	name: 'waitForCompletion',
	type: 'boolean',
	default: true,
	description:
		'Whether to wait until the NAS has finished the task. If disabled, the task ID is returned instead — track it with the Background Task resource.',
};

const maxWaitTime: INodeProperties = {
	displayName: 'Max Wait Time',
	name: 'maxWaitTime',
	type: 'number',
	default: 300,
	typeOptions: { minValue: 1 },
	description:
		'Maximum time in seconds to wait for the task to finish before stopping it and failing',
};

export const fileOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['file'] } },
		options: [
			{
				name: 'Copy',
				value: 'copy',
				description: 'Copy a file or folder to another folder',
				action: 'Copy a file',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a file or folder',
				action: 'Delete a file',
			},
			{
				name: 'Download',
				value: 'download',
				description: 'Download a file (a folder is downloaded as a ZIP archive)',
				action: 'Download a file',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get information about a file or folder',
				action: 'Get a file',
			},
			{
				name: 'Move',
				value: 'move',
				description: 'Move a file or folder to another folder',
				action: 'Move a file',
			},
			{
				name: 'Rename',
				value: 'rename',
				description: 'Rename a file or folder',
				action: 'Rename a file',
			},
			{
				name: 'Upload',
				value: 'upload',
				description: 'Upload a file to a folder',
				action: 'Upload a file',
			},
		],
		default: 'download',
	},
];

export const fileFields: INodeProperties[] = [
	// ----------------------------------------
	//         file: copy / move
	// ----------------------------------------
	{
		displayName: 'Source Path',
		name: 'path',
		type: 'string',
		required: true,
		default: '',
		placeholder: '/photo/vacation/img_001.jpg',
		description: 'Path of the file or folder to copy/move, starting with a shared folder',
		displayOptions: { show: { resource: ['file'], operation: ['copy', 'move'] } },
	},
	{
		displayName: 'Destination Folder',
		name: 'destinationFolderPath',
		type: 'string',
		required: true,
		default: '',
		placeholder: '/backup/photos',
		description: 'Path of the folder the file/folder is copied or moved into',
		displayOptions: { show: { resource: ['file'], operation: ['copy', 'move'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { resource: ['file'], operation: ['copy', 'move'] } },
		options: [overwriteBehavior, maxWaitTime, waitForCompletion],
	},

	// ----------------------------------------
	//              file: delete
	// ----------------------------------------
	{
		displayName: 'Path',
		name: 'path',
		type: 'string',
		required: true,
		default: '',
		placeholder: '/photo/vacation/img_001.jpg',
		description: 'Path of the file or folder to delete, starting with a shared folder',
		displayOptions: { show: { resource: ['file'], operation: ['delete'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { resource: ['file'], operation: ['delete'] } },
		options: [
			maxWaitTime,
			{
				displayName: 'Recursive',
				name: 'recursive',
				type: 'boolean',
				default: true,
				description:
					'Whether to delete all files within a folder recursively. When disabled, deleting a non-empty folder fails.',
			},
			waitForCompletion,
		],
	},

	// ----------------------------------------
	//             file: download
	// ----------------------------------------
	{
		displayName: 'Path',
		name: 'path',
		type: 'string',
		required: true,
		default: '',
		placeholder: '/photo/vacation/img_001.jpg',
		description:
			'Path of the file to download, starting with a shared folder. A folder path is downloaded as a ZIP archive.',
		displayOptions: { show: { resource: ['file'], operation: ['download'] } },
	},
	{
		displayName: 'Put Output File in Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		hint: 'The name of the output binary field to put the file in',
		displayOptions: { show: { resource: ['file'], operation: ['download'] } },
	},

	// ----------------------------------------
	//                file: get
	// ----------------------------------------
	{
		displayName: 'Path',
		name: 'path',
		type: 'string',
		required: true,
		default: '',
		placeholder: '/photo/vacation/img_001.jpg',
		description: 'Path of the file or folder, starting with a shared folder',
		displayOptions: { show: { resource: ['file'], operation: ['get'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { resource: ['file'], operation: ['get'] } },
		options: [
			{
				displayName: 'Additional Fields',
				name: 'additional',
				type: 'multiOptions',
				options: fileAdditionalOptions,
				default: ['size', 'time'],
				description: 'Extra file information to include in the response',
			},
		],
	},

	// ----------------------------------------
	//              file: rename
	// ----------------------------------------
	{
		displayName: 'Path',
		name: 'path',
		type: 'string',
		required: true,
		default: '',
		placeholder: '/photo/vacation/img_001.jpg',
		description: 'Path of the file or folder to rename, starting with a shared folder',
		displayOptions: { show: { resource: ['file'], operation: ['rename'] } },
	},
	{
		displayName: 'New Name',
		name: 'newName',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'img_001_edited.jpg',
		description: 'New name of the file or folder (name only, not a path)',
		displayOptions: { show: { resource: ['file'], operation: ['rename'] } },
	},

	// ----------------------------------------
	//              file: upload
	// ----------------------------------------
	{
		displayName: 'Destination Folder',
		name: 'folderPath',
		type: 'string',
		required: true,
		default: '',
		placeholder: '/photo/uploads',
		description: 'Path of the folder to upload the file into, starting with a shared folder',
		displayOptions: { show: { resource: ['file'], operation: ['upload'] } },
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		hint: 'The name of the input binary field containing the file to upload',
		displayOptions: { show: { resource: ['file'], operation: ['upload'] } },
	},
	{
		displayName: 'File Name',
		name: 'fileName',
		type: 'string',
		default: '',
		placeholder: 'report.pdf',
		description: 'Name to store the file under. Defaults to the file name of the binary data.',
		displayOptions: { show: { resource: ['file'], operation: ['upload'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { resource: ['file'], operation: ['upload'] } },
		options: [
			{
				displayName: 'Create Parent Folders',
				name: 'createParents',
				type: 'boolean',
				default: true,
				description: 'Whether to create the destination folder (and its parents) if missing',
			},
			overwriteBehavior,
		],
	},
];
