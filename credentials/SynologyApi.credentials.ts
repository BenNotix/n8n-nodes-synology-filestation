import type { ICredentialType, Icon, INodeProperties } from 'n8n-workflow';

export class SynologyApi implements ICredentialType {
	name = 'synologyApi';

	displayName = 'Synology API';

	documentationUrl = 'https://github.com/BenNotix/n8n-nodes-synology?tab=readme-ov-file#credentials';

	icon: Icon = { light: 'file:../icons/synology.svg', dark: 'file:../icons/synology.dark.svg' };

	properties: INodeProperties[] = [
		{
			displayName:
				'Use a dedicated DSM account with access limited to the shared folders you need. Accounts protected by 2-factor authentication are not supported — the DSM Web API needs a plain account + password login.',
			name: 'notice',
			type: 'notice',
			default: '',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			required: true,
			default: '',
			placeholder: 'https://your-nas.example.com:5001',
			description:
				'Address of your Synology DSM, including protocol and port (by default 5000 for HTTP, 5001 for HTTPS). QuickConnect URLs are not supported — use a direct address or a DDNS hostname.',
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			required: true,
			default: '',
			description: 'DSM account used to log in',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
		},
		{
			displayName: 'Ignore SSL Issues (Insecure)',
			name: 'ignoreSslIssues',
			type: 'boolean',
			default: false,
			description:
				'Whether to connect even if SSL certificate validation fails — common when DSM uses its default self-signed certificate',
		},
	];

	// The credential is verified by the programmatic `synologyApiTest` function
	// of the Synology File Station node (a declarative test cannot distinguish
	// a DSM login response from an arbitrary 200 response of a non-DSM server).
}
