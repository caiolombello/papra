import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient } from '@papra/api-sdk';
import { z } from 'zod';

const apiKey = process.env.PAPRA_API_KEY;
const apiBaseUrl = process.env.PAPRA_API_URL || 'https://api.papra.app';
const defaultOrgId = process.env.PAPRA_DEFAULT_ORGANIZATION_ID;

if (!apiKey) {
  console.error('PAPRA_API_KEY environment variable is required');
  process.exit(1);
}

const client = createClient({ apiKey, apiBaseUrl });
const server = new McpServer({ name: 'papra', version: '0.1.0' });

const orgIdParam = defaultOrgId
  ? z.string().optional().default(defaultOrgId).describe('Organization ID (uses default if omitted)')
  : z.string().describe('Organization ID');

// --- Organizations ---
server.tool('papra_list_organizations', 'List organizations the API key has access to', {}, async () => {
  const result = await client.listOrganizations();
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('papra_get_current_api_key', 'Get info about the current API key', {}, async () => {
  const result = await client.getCurrentApiKey();
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

// --- Documents ---
server.tool('papra_search', 'Search documents and meetings', {
  organizationId: orgIdParam,
  searchQuery: z.string().describe('Search query'),
  scope: z.enum(['all', 'documents', 'meetings']).optional().default('all'),
  pageIndex: z.number().optional().default(0),
  pageSize: z.number().optional().default(20),
}, async ({ organizationId, searchQuery, scope, pageIndex, pageSize }) => {
  const result = await client.search({ organizationId, searchQuery, scope, pageIndex, pageSize });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

// --- Tags ---
server.tool('papra_list_tags', 'List tags in an organization', {
  organizationId: orgIdParam,
}, async ({ organizationId }) => {
  const result = await client.listTags({ organizationId });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('papra_create_tag', 'Create a tag', {
  organizationId: orgIdParam,
  name: z.string().describe('Tag name'),
  color: z.string().describe('Hex color'),
  description: z.string().optional().describe('Tag description'),
}, async ({ organizationId, name, color, description }) => {
  const result = await client.createTag({ organizationId, name, color, description });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('papra_add_tag_to_document', 'Add a tag to a document', {
  organizationId: orgIdParam,
  documentId: z.string().describe('Document ID'),
  tagId: z.string().describe('Tag ID'),
}, async ({ organizationId, documentId, tagId }) => {
  await client.addTagToDocument({ organizationId, documentId, tagId });
  return { content: [{ type: 'text', text: JSON.stringify({ ok: true, documentId, tagId }) }] };
});

// --- Custom Properties ---
server.tool('papra_list_custom_properties', 'List custom property definitions', {
  organizationId: orgIdParam,
}, async ({ organizationId }) => {
  const result = await client.listCustomProperties({ organizationId });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('papra_set_document_custom_property', 'Set a custom property value on a document', {
  organizationId: orgIdParam,
  documentId: z.string().describe('Document ID'),
  propertyDefinitionId: z.string().describe('Custom property definition ID'),
  value: z.unknown().describe('Property value (type depends on property definition)'),
}, async ({ organizationId, documentId, propertyDefinitionId, value }) => {
  await client.setDocumentCustomProperty({ organizationId, documentId, propertyDefinitionId, value });
  return { content: [{ type: 'text', text: JSON.stringify({ ok: true, documentId, propertyDefinitionId }) }] };
});

server.tool('papra_delete_document_custom_property', 'Delete a custom property value from a document', {
  organizationId: orgIdParam,
  documentId: z.string().describe('Document ID'),
  propertyDefinitionId: z.string().describe('Custom property definition ID'),
}, async ({ organizationId, documentId, propertyDefinitionId }) => {
  await client.deleteDocumentCustomProperty({ organizationId, documentId, propertyDefinitionId });
  return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
});

// --- Tagging Rules ---
server.tool('papra_list_tagging_rules', 'List tagging rules', {
  organizationId: orgIdParam,
}, async ({ organizationId }) => {
  const result = await client.listTaggingRules({ organizationId });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('papra_create_tagging_rule', 'Create a tagging rule', {
  organizationId: orgIdParam,
  name: z.string().describe('Rule name'),
  description: z.string().optional(),
  enabled: z.boolean().optional().default(true),
  conditionMatchMode: z.enum(['all', 'any']).optional().default('all'),
  conditions: z.array(z.object({
    field: z.enum(['name', 'content', 'sourceEmail']),
    operator: z.enum(['equal', 'not_equal', 'contains', 'not_contains', 'starts_with', 'ends_with']),
    value: z.string(),
  })).describe('Rule conditions'),
  tagIds: z.array(z.string()).describe('Tag IDs to apply'),
  folderId: z.string().nullable().optional().describe('Folder to move matching documents to'),
}, async ({ organizationId, ...taggingRule }) => {
  const result = await client.createTaggingRule({ organizationId, taggingRule });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('papra_update_tagging_rule', 'Update a tagging rule', {
  organizationId: orgIdParam,
  taggingRuleId: z.string().describe('Tagging rule ID'),
  name: z.string().describe('Rule name'),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  conditionMatchMode: z.enum(['all', 'any']).optional(),
  conditions: z.array(z.object({
    field: z.enum(['name', 'content', 'sourceEmail']),
    operator: z.enum(['equal', 'not_equal', 'contains', 'not_contains', 'starts_with', 'ends_with']),
    value: z.string(),
  })).optional(),
  tagIds: z.array(z.string()),
  folderId: z.string().nullable().optional(),
}, async ({ organizationId, taggingRuleId, ...taggingRule }) => {
  const result = await client.updateTaggingRule({ organizationId, taggingRuleId, taggingRule });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('papra_delete_tagging_rule', 'Delete a tagging rule', {
  organizationId: orgIdParam,
  taggingRuleId: z.string().describe('Tagging rule ID'),
}, async ({ organizationId, taggingRuleId }) => {
  await client.deleteTaggingRule({ organizationId, taggingRuleId });
  return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
});

server.tool('papra_apply_tagging_rule', 'Apply a tagging rule to all existing documents', {
  organizationId: orgIdParam,
  taggingRuleId: z.string().describe('Tagging rule ID'),
}, async ({ organizationId, taggingRuleId }) => {
  const result = await client.applyTaggingRuleToExistingDocuments({ organizationId, taggingRuleId });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

// --- Meetings ---
server.tool('papra_list_meetings', 'List meetings', {
  organizationId: orgIdParam,
  pageIndex: z.number().optional().default(0),
  pageSize: z.number().optional().default(100),
}, async ({ organizationId, pageIndex, pageSize }) => {
  const result = await client.listMeetings({ organizationId, pageIndex, pageSize });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('papra_get_meeting', 'Get a meeting by ID', {
  organizationId: orgIdParam,
  meetingId: z.string().describe('Meeting ID'),
}, async ({ organizationId, meetingId }) => {
  const result = await client.getMeeting({ organizationId, meetingId });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('papra_search_meetings', 'Search meetings', {
  organizationId: orgIdParam,
  searchQuery: z.string(),
  pageIndex: z.number().optional().default(0),
  pageSize: z.number().optional().default(100),
}, async ({ organizationId, searchQuery, pageIndex, pageSize }) => {
  const result = await client.searchMeetings({ organizationId, searchQuery, pageIndex, pageSize });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

server.tool('papra_delete_meeting', 'Delete a meeting', {
  organizationId: orgIdParam,
  meetingId: z.string().describe('Meeting ID'),
}, async ({ organizationId, meetingId }) => {
  await client.deleteMeeting({ organizationId, meetingId });
  return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
});

// --- Start server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('MCP server error:', error);
  process.exit(1);
});
