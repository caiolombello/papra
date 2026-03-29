# Papra API SDK

This is a JS/TS SDK for the Papra API.
[Papra](https://papra.app) is an open-source self-hostable document archiving platform.

# Prerequisites

To use the SDK, you need to have an API key. You can create one in your user settings (under /api-keys).

## Installation

```bash
pnpm install @papra/api-sdk
# or
npm install @papra/api-sdk
# or
yarn add @papra/api-sdk
```

## Usage

```ts
import { createClient } from '@papra/api-sdk';

const client = createClient({
  // The API key can be found in your user settings (under /api-keys)
  // you may want to store this in an environment variable
  apiKey: 'ppapi_...',

  // Optional: base URL of the API
  apiBaseUrl: 'http://papra.your-instance.tld',
});

const myFile = new File(['test'], 'test.txt', { type: 'text/plain' });

await client.uploadDocument({
  file: myFile,
  organizationId: 'org_...', // The id of the organization you want to upload the document to
});

const { meeting } = await client.createMeeting({
  organizationId: 'org_...',
  meeting: {
    title: 'Weekly architecture sync',
    language: 'pt',
    context: 'tecnologia',
    chunks: [
      { speaker: 'Caio', startedAtMs: 0, endedAtMs: 6000, content: 'Vamos usar MCP e OpenAI.' },
    ],
  },
});

const ingestedMeeting = await client.ingestMeeting({
  organizationId: 'org_...',
  meeting: {
    title: 'Weekly architecture sync',
    sourceStorageKey: 'uploads/2026-03-29/meeting-123.flac',
    transcriptStorageKey: 'transcripts/meeting-123/transcript.txt',
    chunks: [
      { speaker: 'Caio', startedAtMs: 0, endedAtMs: 6000, content: 'Vamos usar MCP e OpenAI.' },
    ],
  },
});

const { propertyDefinitions } = await client.listCustomProperties({
  organizationId: 'org_...',
});

const { taggingRules } = await client.listTaggingRules({
  organizationId: 'org_...',
});
```

You can also scope the client to a specific organization:

```ts
const client = createClient({ apiKey, apiBaseUrl }).forOrganization('org_...');

await client.uploadDocument({ file });

await client.createTaggingRule({
  taggingRule: {
    name: 'Invoices',
    description: 'Auto-tag invoices from known vendors',
    conditions: [{ field: 'content', operator: 'contains', value: 'Invoice' }],
    tagIds: ['tag_...'],
  },
});

const { meetings } = await client.searchMeetings({
  searchQuery: 'LangChain',
});

await client.updateMeeting({
  organizationId: 'org_...',
  meetingId: meeting.id,
  meeting: {
    summary: 'Discussed MCP, OpenAI, and LangChain integration.',
  },
});

const unifiedSearch = await client.search({
  organizationId: 'org_...',
  searchQuery: 'LangChain',
  scope: 'all',
});
```

## License

This project is licensed under the AGPL-3.0 License - see the [LICENSE](./LICENSE) file for details.

## Community

Join the community on [Papra's Discord server](https://papra.app/discord) to discuss the project, ask questions, or get help.

## Credits

This project is crafted with ❤️ by [Corentin Thomasset](https://corentin.tech).
If you find this project helpful, please consider [supporting my work](https://buymeacoffee.com/cthmsst).
