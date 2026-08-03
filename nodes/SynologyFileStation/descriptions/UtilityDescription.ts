import type { INodeProperties } from 'n8n-workflow';

export const utilityOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['utility'] } },
		options: [
			{
				name: 'Check Permission',
				value: 'checkPermission',
				description: 'Check whether the account may write a given file into a folder',
				action: 'Check write permission',
			},
			{
				name: 'Get Directory Size',
				value: 'dirSize',
				description: 'Compute the accumulated size of a folder',
				action: 'Get the size of a directory',
			},
			{
				name: 'Get Info',
				value: 'getInfo',
				description: 'Get File Station information (hostname, capabilities)',
				action: 'Get file station info',
			},
			{
				name: 'Get MD5',
				value: 'md5',
				description: 'Compute the MD5 checksum of a file',
				action: 'Get the MD5 of a file',
			},
			{
				name: 'Get Thumbnail',
				value: 'thumbnail',
				description: 'Get the thumbnail of an image or video file',
				action: 'Get the thumbnail of a file',
			},
		],
		default: 'getInfo',
	},
];

export const utilityFields: INodeProperties[] = [
	// ----------------------------------------
	//        utility: checkPermission
	// ----------------------------------------
	{
		displayName: 'Folder Path',
		name: 'path',
		type: 'string',
		required: true,
		default: '',
		placeholder: '/photo/uploads',
		description: 'Path of the folder to check write permission in, starting with a shared folder',
		displayOptions: { show: { resource: ['utility'], operation: ['checkPermission'] } },
	},
	{
		displayName: 'File Name',
		name: 'fileName',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'report.pdf',
		description: 'Name of the file that would be written into the folder',
		displayOptions: { show: { resource: ['utility'], operation: ['checkPermission'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { resource: ['utility'], operation: ['checkPermission'] } },
		options: [
			{
				displayName: 'Create Only',
				name: 'createOnly',
				type: 'boolean',
				default: true,
				description: 'Whether the permission is allowed when the file/folder does not exist yet',
			},
			{
				displayName: 'If Target Exists',
				name: 'overwrite',
				type: 'options',
				options: [
					{
						name: 'Fail',
						value: 'error',
						description: 'The check fails when a file with the same name already exists',
					},
					{
						name: 'Overwrite',
						value: 'overwrite',
						description: 'The existing file would be overwritten',
					},
					{
						name: 'Skip',
						value: 'skip',
						description: 'The existing file would be kept',
					},
				],
				default: 'error',
			},
		],
	},

	// ----------------------------------------
	//            utility: dirSize
	// ----------------------------------------
	{
		displayName: 'Folder Path',
		name: 'path',
		type: 'string',
		required: true,
		default: '',
		placeholder: '/photo/vacation',
		description: 'Path of the folder to compute the size of, starting with a shared folder',
		displayOptions: { show: { resource: ['utility'], operation: ['dirSize'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { resource: ['utility'], operation: ['dirSize', 'md5'] } },
		options: [
			{
				displayName: 'Max Wait Time',
				name: 'maxWaitTime',
				type: 'number',
				default: 300,
				typeOptions: { minValue: 1 },
				description:
					'Maximum time in seconds to wait for the computation to finish before stopping it and failing',
			},
		],
	},

	// ----------------------------------------
	//              utility: md5
	// ----------------------------------------
	{
		displayName: 'File Path',
		name: 'path',
		type: 'string',
		required: true,
		default: '',
		placeholder: '/photo/vacation/img_001.jpg',
		description: 'Path of the file to compute the MD5 of, starting with a shared folder',
		displayOptions: { show: { resource: ['utility'], operation: ['md5'] } },
	},

	// ----------------------------------------
	//           utility: thumbnail
	// ----------------------------------------
	{
		displayName: 'File Path',
		name: 'path',
		type: 'string',
		required: true,
		default: '',
		placeholder: '/photo/vacation/img_001.jpg',
		description:
			'Path of the file to get a thumbnail of, starting with a shared folder. Video thumbnails only exist for files in the "photo" shared folder or in user home folders.',
		displayOptions: { show: { resource: ['utility'], operation: ['thumbnail'] } },
	},
	{
		displayName: 'Put Output File in Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		hint: 'The name of the output binary field to put the thumbnail in',
		displayOptions: { show: { resource: ['utility'], operation: ['thumbnail'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { resource: ['utility'], operation: ['thumbnail'] } },
		options: [
			{
				displayName: 'Rotation',
				name: 'rotate',
				type: 'options',
				options: [
					{ name: 'None', value: 0 },
					{ name: 'Rotate 90°', value: 1 },
					{ name: 'Rotate 180°', value: 2 },
					{ name: 'Rotate 270°', value: 3 },
				],
				default: 0,
			},
			{
				displayName: 'Size',
				name: 'size',
				type: 'options',
				options: [
					{ name: 'Large', value: 'large' },
					{ name: 'Medium', value: 'medium' },
					{ name: 'Original', value: 'original' },
					{ name: 'Small', value: 'small' },
				],
				default: 'small',
			},
		],
	},
];
