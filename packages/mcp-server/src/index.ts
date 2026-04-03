import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient } from '@papra/api-sdk';
import { ofetch } from 'ofetch';
import { z } from 'zod';

const apiKey = process.env.PAPRA_API_KEY;
const apiBaseUrl = process.env.PAPRA_API_URL || 'https://api.papra.app';
const defaultOrgId = process.env.PAPRA_DEFAULT_ORGANIZATION_ID;

if (!apiKey) {
  console.error('PAPRA_API_KEY environment variable is required');
  process.exit(1);
}

const client = createClient({ apiKey, apiBaseUrl });
const server = new McpServer({ name: 'papra', version: '0.2.0' });

// Direct API client for endpoints not in the SDK
const api = ofetch.create({
  baseURL: apiBaseUrl,
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
});

const orgId = defaultOrgId
  ? z.string().optional().default(defaultOrgId).describe('Organization ID')
  : z.string().describe('Organization ID');

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

// Strip heavy fields from document listings
function summarizeDoc(d: any) {
  return {
    id: d.id, name: d.name, mimeType: d.mimeType, originalSize: d.originalSize,
    sourceEmail: d.sourceEmail, folderId: d.folderId, createdAt: d.createdAt,
    isDeleted: d.isDeleted,
    tags: d.tags?.map((t: any) => ({ id: t.id, name: t.name })) ?? [],
    customProperties: d.customProperties?.filter((p: any) => p.value != null)
      .map((p: any) => ({ key: p.key, value: p.value })) ?? [],
  };
}

function summarizeMeeting(m: any) {
  return {
    id: m.id, title: m.title, status: m.status, language: m.language,
    context: m.context, summary: m.summary?.slice(0, 200),
    audioDurationSeconds: m.audioDurationSeconds, createdAt: m.createdAt,
    tags: m.tags?.map((t: any) => ({ id: t.id, name: t.name })) ?? [],
  };
}

function summarizeRule(r: any) {
  return {
    id: r.id, name: r.name, enabled: r.enabled,
    conditionMatchMode: r.conditionMatchMode, folderId: r.folderId,
    conditions: r.conditions?.map((c: any) => `${c.field} ${c.operator} "${c.value}"`) ?? [],
    tags: r.actions?.map((a: any) => a.tag?.name).filter(Boolean) ?? [],
  };
}

// ==================== Organizations ====================

server.tool('papra_list_organizations', 'List organizations', {}, async () => {
  const result = await client.listOrganizations();
  return ok(result);
});

server.tool('papra_get_current_api_key', 'Get current API key info', {}, async () => {
  const result = await client.getCurrentApiKey();
  return ok(result);
});

// ==================== Documents (list = summary, get = full, content = separate) ====================

server.tool('papra_list_documents', 'List documents (summary only, no content). Use get_document for full details.', {
  organizationId: orgId,
  pageIndex: z.number().optional().default(0),
  pageSize: z.number().optional().default(25).describe('Max 100'),
  searchQuery: z.string().optional().describe('Search query'),
}, async ({ organizationId, pageIndex, pageSize, searchQuery }) => {
  const params = new URLSearchParams({ pageIndex: String(pageIndex), pageSize: String(pageSize) });
  if (searchQuery) params.set('searchQuery', searchQuery);
  const result = await api(`/api/organizations/${organizationId}/documents?${params}`);
  return ok({
    documentsCount: result.documentsCount,
    pageIndex, pageSize,
    documents: result.documents.map(summarizeDoc),
  });
});

server.tool('papra_get_document', 'Get document metadata and properties (no text content). Use get_document_content for extracted text.', {
  organizationId: orgId,
  documentId: z.string(),
}, async ({ organizationId, documentId }) => {
  const result = await api(`/api/organizations/${organizationId}/documents/${documentId}`);
  const d = result.document;
  return ok({
    ...summarizeDoc(d),
    originalName: d.originalName, originalSha256Hash: d.originalSha256Hash,
    documentDate: d.documentDate, versionNumber: d.versionNumber,
    customProperties: d.customProperties,
  });
});

server.tool('papra_get_document_content', 'Get the extracted text content of a document. Only call when you need to read the actual text.', {
  organizationId: orgId,
  documentId: z.string(),
}, async ({ organizationId, documentId }) => {
  const result = await api(`/api/organizations/${organizationId}/documents/${documentId}`);
  return ok({ id: result.document.id, name: result.document.name, content: result.document.content });
});

server.tool('papra_get_document_statistics', 'Get document count and total storage size', {
  organizationId: orgId,
}, async ({ organizationId }) => {
  const result = await api(`/api/organizations/${organizationId}/documents/stats`);
  return ok(result);
});

server.tool('papra_delete_document', 'Soft-delete a document (move to trash)', {
  organizationId: orgId,
  documentId: z.string(),
}, async ({ organizationId, documentId }) => {
  await api(`/api/organizations/${organizationId}/documents/${documentId}`, { method: 'DELETE' });
  return ok({ ok: true });
});

server.tool('papra_update_document', 'Update document metadata (name, folder, date)', {
  organizationId: orgId,
  documentId: z.string(),
  name: z.string().optional(),
  folderId: z.string().nullable().optional(),
  documentDate: z.string().optional().describe('ISO date string'),
}, async ({ organizationId, documentId, ...body }) => {
  const result = await api(`/api/organizations/${organizationId}/documents/${documentId}`, { method: 'PATCH', body });
  return ok({ ok: true, document: summarizeDoc(result.document) });
});

server.tool('papra_move_document_to_folder', 'Move a document to a folder (or root with null)', {
  organizationId: orgId,
  documentId: z.string(),
  folderId: z.string().nullable().describe('Folder ID, or null for root'),
}, async ({ organizationId, documentId, folderId }) => {
  const result = await api(`/api/organizations/${organizationId}/documents/${documentId}`, { method: 'PATCH', body: { folderId } });
  return ok({ ok: true, document: summarizeDoc(result.document) });
});

// ==================== Tags ====================

server.tool('papra_list_tags', 'List all tags', {
  organizationId: orgId,
}, async ({ organizationId }) => {
  const result = await client.listTags({ organizationId });
  return ok({ tags: result.tags.map((t: any) => ({ id: t.id, name: t.name, color: t.color, description: t.description, documentsCount: t.documentsCount })) });
});

server.tool('papra_create_tag', 'Create a tag', {
  organizationId: orgId,
  name: z.string(), color: z.string(), description: z.string().optional(),
}, async ({ organizationId, name, color, description }) => {
  const result = await client.createTag({ organizationId, name, color, description });
  return ok(result);
});

server.tool('papra_add_tag_to_document', 'Add a tag to a document', {
  organizationId: orgId,
  documentId: z.string(), tagId: z.string(),
}, async ({ organizationId, documentId, tagId }) => {
  await client.addTagToDocument({ organizationId, documentId, tagId });
  return ok({ ok: true });
});

server.tool('papra_remove_tag_from_document', 'Remove a tag from a document', {
  organizationId: orgId,
  documentId: z.string(), tagId: z.string(),
}, async ({ organizationId, documentId, tagId }) => {
  await api(`/api/organizations/${organizationId}/documents/${documentId}/tags/${tagId}`, { method: 'DELETE' });
  return ok({ ok: true });
});

// ==================== Custom Properties ====================

server.tool('papra_list_custom_properties', 'List custom property definitions', {
  organizationId: orgId,
}, async ({ organizationId }) => {
  const result = await client.listCustomProperties({ organizationId });
  return ok(result);
});

server.tool('papra_set_document_custom_property', 'Set a custom property value on a document', {
  organizationId: orgId,
  documentId: z.string(), propertyDefinitionId: z.string(),
  value: z.unknown().describe('Value (string for text, number for number, boolean for boolean, ISO string for date)'),
}, async ({ organizationId, documentId, propertyDefinitionId, value }) => {
  await client.setDocumentCustomProperty({ organizationId, documentId, propertyDefinitionId, value });
  return ok({ ok: true });
});

server.tool('papra_delete_document_custom_property', 'Delete a custom property value', {
  organizationId: orgId,
  documentId: z.string(), propertyDefinitionId: z.string(),
}, async ({ organizationId, documentId, propertyDefinitionId }) => {
  await client.deleteDocumentCustomProperty({ organizationId, documentId, propertyDefinitionId });
  return ok({ ok: true });
});

// ==================== Folders ====================

server.tool('papra_list_folders', 'List document folders. Pass parentId to list subfolders.', {
  organizationId: orgId,
  parentId: z.string().optional().describe('Parent folder ID (omit for root)'),
}, async ({ organizationId, parentId }) => {
  const params = parentId ? `?parentId=${parentId}` : '';
  const result = await api(`/api/organizations/${organizationId}/document-folders${params}`);
  return ok(result);
});

server.tool('papra_create_folder', 'Create a document folder', {
  organizationId: orgId,
  name: z.string(), parentId: z.string().optional(),
}, async ({ organizationId, name, parentId }) => {
  const result = await api(`/api/organizations/${organizationId}/document-folders`, { method: 'POST', body: { name, parentId } });
  return ok(result);
});

server.tool('papra_delete_folder', 'Delete a folder', {
  organizationId: orgId,
  folderId: z.string(),
}, async ({ organizationId, folderId }) => {
  await api(`/api/organizations/${organizationId}/document-folders/${folderId}`, { method: 'DELETE' });
  return ok({ ok: true });
});

// ==================== Tagging Rules (list = summary, get = full) ====================

server.tool('papra_list_tagging_rules', 'List tagging rules (summary). Use get_tagging_rule for full conditions.', {
  organizationId: orgId,
}, async ({ organizationId }) => {
  const result = await client.listTaggingRules({ organizationId });
  return ok({ taggingRules: result.taggingRules.map(summarizeRule) });
});

server.tool('papra_get_tagging_rule', 'Get full tagging rule details', {
  organizationId: orgId,
  taggingRuleId: z.string(),
}, async ({ organizationId, taggingRuleId }) => {
  const result = await client.getTaggingRule({ organizationId, taggingRuleId });
  return ok(result);
});

server.tool('papra_create_tagging_rule', 'Create a tagging rule', {
  organizationId: orgId,
  name: z.string(),
  description: z.string().optional(),
  enabled: z.boolean().optional().default(true),
  conditionMatchMode: z.enum(['all', 'any']).optional().default('all'),
  conditions: z.array(z.object({
    field: z.enum(['name', 'content', 'sourceEmail']),
    operator: z.enum(['equal', 'not_equal', 'contains', 'not_contains', 'starts_with', 'ends_with']),
    value: z.string(),
  })),
  tagIds: z.array(z.string()),
  folderId: z.string().nullable().optional(),
}, async ({ organizationId, ...taggingRule }) => {
  const result = await client.createTaggingRule({ organizationId, taggingRule });
  return ok(result);
});

server.tool('papra_update_tagging_rule', 'Update a tagging rule', {
  organizationId: orgId,
  taggingRuleId: z.string(),
  name: z.string(),
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
  return ok(result);
});

server.tool('papra_delete_tagging_rule', 'Delete a tagging rule', {
  organizationId: orgId, taggingRuleId: z.string(),
}, async ({ organizationId, taggingRuleId }) => {
  await client.deleteTaggingRule({ organizationId, taggingRuleId });
  return ok({ ok: true });
});

server.tool('papra_apply_tagging_rule', 'Apply a tagging rule to all existing documents', {
  organizationId: orgId, taggingRuleId: z.string(),
}, async ({ organizationId, taggingRuleId }) => {
  const result = await client.applyTaggingRuleToExistingDocuments({ organizationId, taggingRuleId });
  return ok(result);
});

// ==================== PDF Password Rules ====================

server.tool('papra_list_pdf_password_rules', 'List PDF password rules for auto-unlocking intake emails', {
  organizationId: orgId,
}, async ({ organizationId }) => {
  const result = await api(`/api/organizations/${organizationId}/pdf-password-rules`);
  return ok(result);
});

server.tool('papra_create_pdf_password_rule', 'Create a PDF password rule', {
  organizationId: orgId,
  name: z.string(), subjectPattern: z.string(), password: z.string(),
  enabled: z.boolean().optional().default(true), priority: z.number().optional().default(0),
}, async ({ organizationId, ...body }) => {
  const result = await api(`/api/organizations/${organizationId}/pdf-password-rules`, { method: 'POST', body });
  return ok(result);
});

// ==================== Intake Emails ====================

server.tool('papra_get_intake_email_log', 'List intake email log entries', {
  organizationId: orgId,
  pageIndex: z.number().optional().default(0),
  pageSize: z.number().optional().default(20),
}, async ({ organizationId, pageIndex, pageSize }) => {
  const params = new URLSearchParams({ pageIndex: String(pageIndex), pageSize: String(pageSize) });
  const result = await api(`/api/organizations/${organizationId}/intake-emails/log?${params}`);
  return ok(result);
});

// ==================== Meetings (list = summary, get = full with chunks) ====================

server.tool('papra_list_meetings', 'List meetings (summary only, no chunks). Use get_meeting for transcript.', {
  organizationId: orgId,
  pageIndex: z.number().optional().default(0),
  pageSize: z.number().optional().default(20),
}, async ({ organizationId, pageIndex, pageSize }) => {
  const result = await client.listMeetings({ organizationId, pageIndex, pageSize });
  return ok({
    meetingsCount: result.meetingsCount,
    meetings: result.meetings.map(summarizeMeeting),
  });
});

server.tool('papra_get_meeting', 'Get full meeting details including transcript chunks', {
  organizationId: orgId, meetingId: z.string(),
}, async ({ organizationId, meetingId }) => {
  const result = await client.getMeeting({ organizationId, meetingId });
  return ok(result);
});

server.tool('papra_get_meeting_stats', 'Get meeting transcription statistics', {
  organizationId: orgId,
}, async ({ organizationId }) => {
  const result = await api(`/api/organizations/${organizationId}/meetings/stats`);
  return ok(result);
});

server.tool('papra_search_meetings', 'Search meetings by text', {
  organizationId: orgId,
  searchQuery: z.string(),
  pageIndex: z.number().optional().default(0),
  pageSize: z.number().optional().default(20),
}, async ({ organizationId, searchQuery, pageIndex, pageSize }) => {
  const result = await client.searchMeetings({ organizationId, searchQuery, pageIndex, pageSize });
  return ok(result);
});

server.tool('papra_delete_meeting', 'Delete a meeting', {
  organizationId: orgId, meetingId: z.string(),
}, async ({ organizationId, meetingId }) => {
  await client.deleteMeeting({ organizationId, meetingId });
  return ok({ ok: true });
});

// ==================== Search ====================

server.tool('papra_search', 'Search across documents and meetings', {
  organizationId: orgId,
  searchQuery: z.string(),
  scope: z.enum(['all', 'documents', 'meetings']).optional().default('all'),
  pageIndex: z.number().optional().default(0),
  pageSize: z.number().optional().default(20),
}, async ({ organizationId, searchQuery, scope, pageIndex, pageSize }) => {
  const result = await client.search({ organizationId, searchQuery, scope, pageIndex, pageSize });
  return ok({
    totalCount: result.totalCount,
    documentsCount: result.documentsCount,
    meetingsCount: result.meetingsCount,
    documents: result.documents.map(summarizeDoc),
    meetings: result.meetings.map(summarizeMeeting),
  });
});

// ==================== Start ====================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('MCP server error:', error);
  process.exit(1);
});
