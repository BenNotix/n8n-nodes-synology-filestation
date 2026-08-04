import type { INodeProperties } from 'n8n-workflow';

export const taskOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['task'] } },
		options: [
			{
				name: 'Delete',
				value: 'delete',
				description:
					'Remove a sync task from its connection (synced files stay on both sides)',
				action: 'Delete a sync task',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List the sync tasks (folder pairs) of a connection and their status',
				action: 'Get many sync tasks',
			},
		],
		default: 'getAll',
	},
];

export const taskFields: INodeProperties[] = [
	{
		displayName: 'Connection ID',
		name: 'connectionId',
		type: 'number',
		required: true,
		default: 0,
		description:
			'ID of the cloud connection the tasks belong to — find it with Connection → Get Many',
		displayOptions: { show: { resource: ['task'], operation: ['delete', 'getAll'] } },
	},
	{
		displayName: 'Task ID',
		name: 'sessionId',
		type: 'number',
		required: true,
		default: 0,
		description: 'ID of the sync task — find it with Get Many (field "sess_id")',
		displayOptions: { show: { resource: ['task'], operation: ['delete'] } },
	},
];
