import type { INodeProperties } from 'n8n-workflow';

export const reportOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['report'] } },
		options: [
			{
				name: 'Get Configuration',
				value: 'getConfig',
				description: 'Get the Cloud Sync package configuration (volumes, workers, admin mode)',
				action: 'Get the cloud sync configuration',
			},
			{
				name: 'Get Recently Changed',
				value: 'getRecentlyChanged',
				description: 'Get the files most recently synchronized across all connections',
				action: 'Get recently changed files',
			},
		],
		default: 'getRecentlyChanged',
	},
];

export const reportFields: INodeProperties[] = [];
