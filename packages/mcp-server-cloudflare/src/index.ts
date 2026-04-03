import { McpAgent } from 'agents/mcp';
import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// ==================== Types ====================

interface Env {
  PAPRA_API_KEY: string;
  PAPRA_BASE_URL: string;
  PAPRA_DEFAULT_ORGANIZATION_ID: string;
  ALLOWED_EMAILS: string;
  COOKIE_ENCRYPTION_KEY: string;
  ACCESS_AUTHORIZATION_URL: string;
  ACCESS_TOKEN_URL: string;
  ACCESS_CLIENT_ID: string;
  ACCESS_CLIENT_SECRET: string;
  ACCESS_JWKS_URL: string;
  MCP_OBJECT: DurableObjectNamespace;
  OAUTH_KV: KVNamespace;
}

// ==================== Helpers ====================

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '');
}

function safeJsonParse(text: string | null) {
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { return text; }
}

function resolveOrgId(env: Env) {
  if (!env.PAPRA_DEFAULT_ORGANIZATION_ID) throw new Error('PAPRA_DEFAULT_ORGANIZATION_ID not configured');
  return env.PAPRA_DEFAULT_ORGANIZATION_ID;
}

function allowedEmails(env: Env) {
  return new Set(
    (env.ALLOWED_EMAILS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean),
  );
}

function ensureUserAllowed(env: Env, email: string | undefined) {
  const set = allowedEmails(env);
  if (set.size === 0) return;
  if (!email || !set.has(email.toLowerCase())) throw new Error('Account not allowed');
}

function makeResult(data: unknown) {
  return {
    content: [{ text: JSON.stringify(data, null, 2), type: 'text' as const }],
    structuredContent: data,
  };
}

function makeError(message: string) {
  return { content: [{ text: message, type: 'text' as const }], isError: true };
}

async function runTool(env: Env, email: string | undefined, fn: () => Promise<unknown>) {
  try {
    ensureUserAllowed(env, email);
    const data = await fn();
    return makeResult(data);
  } catch (error) {
    return makeError(error instanceof Error ? error.message : String(error));
  }
}

async function papraFetch(env: Env, path: string, init?: { method?: string; body?: string; query?: Record<string, unknown>; headers?: Record<string, string> }) {
  if (!env.PAPRA_API_KEY) throw new Error('PAPRA_API_KEY not configured');
  const baseUrl = env.PAPRA_BASE_URL || 'https://docs.lombello.com';
  const url = new URL(`${normalizeBaseUrl(baseUrl)}${path}`);
  for (const [key, value] of Object.entries(init?.query || {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  const headers = new Headers(init?.headers || {});
  headers.set('Authorization', `Bearer ${env.PAPRA_API_KEY}`);
  if (!(init?.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(url, { ...init, headers });
  const text = await response.text();
  const data = safeJsonParse(text);
  if (!response.ok) throw new Error(`Papra API error ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

// ==================== Schemas ====================

const taggingRuleConditionSchema = z.object({
  field: z.enum(['name', 'content', 'sourceEmail']),
  operator: z.enum(['equal', 'not_equal', 'contains', 'not_contains', 'starts_with', 'ends_with']),
  value: z.string().min(1),
});

const meetingChunkSchema = z.object({
  speaker: z.string().min(1).optional(),
  startedAtMs: z.number().int().min(0).optional(),
  endedAtMs: z.number().int().min(0).optional(),
  content: z.string().min(1),
});

// ==================== Summarizers (reduce response size) ====================

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

// ==================== MCP Agent ====================

export class MyMCP extends McpAgent<Env> {
  server = new McpServer({ name: 'papra-remote-mcp', version: '1.2.0' });

  async init() {
    const email = this.props?.email;
    const orgId = resolveOrgId(this.env);
    const env = this.env;

    // --- Search ---
    this.server.tool('papra_search', 'Search documents and meetings', {
      searchQuery: z.string().default(''), scope: z.enum(['all', 'documents', 'meetings']).default('all'),
      pageIndex: z.number().int().min(0).default(0), pageSize: z.number().int().min(1).max(100).default(20),
    }, async ({ searchQuery, scope, pageIndex, pageSize }) => runTool(env, email, async () => {
      const r = await papraFetch(env, `/api/organizations/${orgId}/search`, { method: 'GET', query: { searchQuery, scope, pageIndex, pageSize } });
      return { ...r, documents: r.documents?.map(summarizeDoc), meetings: r.meetings?.map(summarizeMeeting) };
    }));

    // --- Documents (list=summary, get=metadata, content=separate) ---
    this.server.tool('papra_list_documents', 'List documents (summary, no content). Use get_document for details.', {
      searchQuery: z.string().optional(), pageIndex: z.number().int().min(0).default(0),
      pageSize: z.number().int().min(1).max(100).default(25), includeDeleted: z.boolean().default(false),
    }, async ({ searchQuery, pageIndex, pageSize, includeDeleted }) => runTool(env, email, async () => {
      const path = includeDeleted ? `/api/organizations/${orgId}/documents/deleted` : `/api/organizations/${orgId}/documents`;
      const r = await papraFetch(env, path, { method: 'GET', query: { pageIndex, pageSize, searchQuery } });
      return { ...r, documents: r.documents?.map(summarizeDoc) };
    }));

    this.server.tool('papra_get_document', 'Get document metadata (no text content). Use get_document_content for text.', {
      documentId: z.string(),
    }, async ({ documentId }) => runTool(env, email, async () => {
      const r = await papraFetch(env, `/api/organizations/${orgId}/documents/${documentId}`, { method: 'GET' });
      const d = r.document;
      return { ...summarizeDoc(d), originalName: d.originalName, originalSha256Hash: d.originalSha256Hash, documentDate: d.documentDate, versionNumber: d.versionNumber, customProperties: d.customProperties };
    }));

    this.server.tool('papra_get_document_content', 'Get extracted text content. Use offset/limit for large docs.', {
      documentId: z.string(), offset: z.number().default(0), limit: z.number().default(8000).describe('Max chars (0=all)'),
    }, async ({ documentId, offset, limit }) => runTool(env, email, async () => {
      const r = await papraFetch(env, `/api/organizations/${orgId}/documents/${documentId}`, { method: 'GET' });
      const content = r.document.content ?? '';
      const slice = limit > 0 ? content.slice(offset, offset + limit) : content.slice(offset);
      return { id: r.document.id, name: r.document.name, contentLength: content.length, offset, hasMore: offset + slice.length < content.length, content: slice };
    }));

    this.server.tool('papra_get_document_statistics', 'Get document count and storage size', {}, async () => runTool(env, email, async () =>
      papraFetch(env, `/api/organizations/${orgId}/documents/statistics`, { method: 'GET' }),
    ));

    this.server.tool('papra_update_document', 'Update document metadata', {
      documentId: z.string(), name: z.string().optional(), folderId: z.string().nullable().optional(), documentDate: z.string().optional(),
    }, async ({ documentId, ...body }) => runTool(env, email, async () => {
      await papraFetch(env, `/api/organizations/${orgId}/documents/${documentId}`, { method: 'PATCH', body: JSON.stringify(body) });
      return { ok: true };
    }));

    this.server.tool('papra_move_document_to_folder', 'Move document to folder (null=root)', {
      documentId: z.string(), folderId: z.string().nullable(),
    }, async ({ documentId, folderId }) => runTool(env, email, async () => {
      await papraFetch(env, `/api/organizations/${orgId}/documents/${documentId}`, { method: 'PATCH', body: JSON.stringify({ folderId }) });
      return { ok: true };
    }));

    this.server.tool('papra_delete_document', 'Soft-delete a document', {
      documentId: z.string(),
    }, async ({ documentId }) => runTool(env, email, async () => {
      await papraFetch(env, `/api/organizations/${orgId}/documents/${documentId}`, { method: 'DELETE' });
      return { ok: true };
    }));

    // --- Tags ---
    this.server.tool('papra_list_tags', 'List all tags', {}, async () => runTool(env, email, async () => {
      const r = await papraFetch(env, `/api/organizations/${orgId}/tags`, { method: 'GET' });
      return { tags: r.tags?.map((t: any) => ({ id: t.id, name: t.name, color: t.color, description: t.description, documentsCount: t.documentsCount })) };
    }));

    this.server.tool('papra_create_tag', 'Create a tag', {
      name: z.string(), color: z.string(), description: z.string().optional(),
    }, async (payload) => runTool(env, email, async () =>
      papraFetch(env, `/api/organizations/${orgId}/tags`, { method: 'POST', body: JSON.stringify(payload) }),
    ));

    this.server.tool('papra_add_tag_to_document', 'Add tag to document', {
      documentId: z.string(), tagId: z.string(),
    }, async ({ documentId, tagId }) => runTool(env, email, async () => {
      await papraFetch(env, `/api/organizations/${orgId}/documents/${documentId}/tags`, { method: 'POST', body: JSON.stringify({ tagId }) });
      return { ok: true };
    }));

    this.server.tool('papra_remove_tag_from_document', 'Remove tag from document', {
      documentId: z.string(), tagId: z.string(),
    }, async ({ documentId, tagId }) => runTool(env, email, async () => {
      await papraFetch(env, `/api/organizations/${orgId}/documents/${documentId}/tags/${tagId}`, { method: 'DELETE' });
      return { ok: true };
    }));

    this.server.tool('papra_add_tag_to_meeting', 'Add tag to meeting', {
      meetingId: z.string(), tagId: z.string(),
    }, async ({ meetingId, tagId }) => runTool(env, email, async () => {
      await papraFetch(env, `/api/organizations/${orgId}/meetings/${meetingId}/tags`, { method: 'POST', body: JSON.stringify({ tagId }) });
      return { ok: true };
    }));

    this.server.tool('papra_remove_tag_from_meeting', 'Remove tag from meeting', {
      meetingId: z.string(), tagId: z.string(),
    }, async ({ meetingId, tagId }) => runTool(env, email, async () => {
      await papraFetch(env, `/api/organizations/${orgId}/meetings/${meetingId}/tags/${tagId}`, { method: 'DELETE' });
      return { ok: true };
    }));

    // --- Custom Properties ---
    this.server.tool('papra_list_custom_properties', 'List custom property definitions', {}, async () => runTool(env, email, async () =>
      papraFetch(env, `/api/organizations/${orgId}/custom-properties`, { method: 'GET' }),
    ));

    this.server.tool('papra_get_document_custom_properties', 'Get custom property values for a document', {
      documentId: z.string(),
    }, async ({ documentId }) => runTool(env, email, async () =>
      papraFetch(env, `/api/organizations/${orgId}/documents/${documentId}/custom-properties`, { method: 'GET' }),
    ));

    this.server.tool('papra_set_document_custom_property', 'Set a custom property value', {
      documentId: z.string(), propertyDefinitionId: z.string(), value: z.any(),
    }, async ({ documentId, propertyDefinitionId, value }) => runTool(env, email, async () => {
      await papraFetch(env, `/api/organizations/${orgId}/documents/${documentId}/custom-properties/${propertyDefinitionId}`, { method: 'PUT', body: JSON.stringify({ value }) });
      return { ok: true };
    }));

    // --- Folders ---
    this.server.tool('papra_list_folders', 'List folders (parentId for subfolders)', {
      parentId: z.string().optional(),
    }, async ({ parentId }) => runTool(env, email, async () =>
      papraFetch(env, `/api/organizations/${orgId}/document-folders`, { method: 'GET', query: { parentId } }),
    ));

    this.server.tool('papra_get_folder', 'Get folder details', {
      folderId: z.string(),
    }, async ({ folderId }) => runTool(env, email, async () =>
      papraFetch(env, `/api/organizations/${orgId}/document-folders/${folderId}`, { method: 'GET' }),
    ));

    this.server.tool('papra_create_folder', 'Create a folder', {
      name: z.string(), parentId: z.string().optional(),
    }, async (payload) => runTool(env, email, async () =>
      papraFetch(env, `/api/organizations/${orgId}/document-folders`, { method: 'POST', body: JSON.stringify(payload) }),
    ));

    this.server.tool('papra_delete_folder', 'Delete a folder', {
      folderId: z.string(),
    }, async ({ folderId }) => runTool(env, email, async () => {
      await papraFetch(env, `/api/organizations/${orgId}/document-folders/${folderId}`, { method: 'DELETE' });
      return { ok: true };
    }));

    // --- Tagging Rules (list=summary, get=full) ---
    this.server.tool('papra_list_tagging_rules', 'List tagging rules (summary)', {}, async () => runTool(env, email, async () => {
      const r = await papraFetch(env, `/api/organizations/${orgId}/tagging-rules`, { method: 'GET' });
      return { taggingRules: r.taggingRules?.map(summarizeRule) };
    }));

    this.server.tool('papra_create_tagging_rule', 'Create a tagging rule', {
      name: z.string().min(1).max(64),
      description: z.string().max(256).optional(),
      enabled: z.boolean().optional(),
      conditionMatchMode: z.enum(['all', 'any']).optional(),
      conditions: z.array(taggingRuleConditionSchema).min(1).max(10),
      tagIds: z.array(z.string()).min(1),
      folderId: z.string().nullable().optional(),
    }, async (payload) => runTool(env, email, async () => {
      await papraFetch(env, `/api/organizations/${orgId}/tagging-rules`, { method: 'POST', body: JSON.stringify(payload) });
      return { ok: true, ...payload };
    }));

    this.server.tool('papra_update_tagging_rule', 'Update a tagging rule', {
      taggingRuleId: z.string(),
      name: z.string().min(1).max(64),
      description: z.string().max(256).optional(),
      enabled: z.boolean().optional(),
      conditionMatchMode: z.enum(['all', 'any']).optional(),
      conditions: z.array(taggingRuleConditionSchema).max(10).optional(),
      tagIds: z.array(z.string()).min(1),
      folderId: z.string().nullable().optional(),
    }, async ({ taggingRuleId, ...payload }) => runTool(env, email, async () => {
      await papraFetch(env, `/api/organizations/${orgId}/tagging-rules/${taggingRuleId}`, { method: 'PUT', body: JSON.stringify(payload) });
      return { ok: true };
    }));

    this.server.tool('papra_delete_tagging_rule', 'Delete a tagging rule', {
      taggingRuleId: z.string(),
    }, async ({ taggingRuleId }) => runTool(env, email, async () => {
      await papraFetch(env, `/api/organizations/${orgId}/tagging-rules/${taggingRuleId}`, { method: 'DELETE' });
      return { ok: true };
    }));

    this.server.tool('papra_apply_tagging_rule', 'Apply tagging rule to existing documents', {
      taggingRuleId: z.string(),
    }, async ({ taggingRuleId }) => runTool(env, email, async () =>
      papraFetch(env, `/api/organizations/${orgId}/tagging-rules/${taggingRuleId}/apply`, { method: 'POST' }),
    ));

    // --- PDF Password Rules ---
    this.server.tool('papra_list_pdf_password_rules', 'List PDF password rules', {}, async () => runTool(env, email, async () =>
      papraFetch(env, `/api/organizations/${orgId}/pdf-password-rules`, { method: 'GET' }),
    ));

    this.server.tool('papra_create_pdf_password_rule', 'Create PDF password rule', {
      name: z.string(), subjectPattern: z.string(), password: z.string(),
      enabled: z.boolean().optional(), priority: z.number().optional(),
    }, async (payload) => runTool(env, email, async () =>
      papraFetch(env, `/api/organizations/${orgId}/pdf-password-rules`, { method: 'POST', body: JSON.stringify(payload) }),
    ));

    // --- Intake Emails ---
    this.server.tool('papra_get_intake_email_log', 'List intake email log', {
      pageIndex: z.number().int().min(0).default(0), pageSize: z.number().int().min(1).max(100).default(20),
    }, async ({ pageIndex, pageSize }) => runTool(env, email, async () =>
      papraFetch(env, `/api/organizations/${orgId}/intake-emails/log`, { method: 'GET', query: { pageIndex, pageSize } }),
    ));

    // --- Meetings (list=summary, get=metadata, transcript=separate) ---
    this.server.tool('papra_list_meetings', 'List meetings (summary, no chunks)', {
      pageIndex: z.number().int().min(0).default(0), pageSize: z.number().int().min(1).max(100).default(20),
    }, async ({ pageIndex, pageSize }) => runTool(env, email, async () => {
      const r = await papraFetch(env, `/api/organizations/${orgId}/meetings`, { method: 'GET', query: { pageIndex, pageSize } });
      return { ...r, meetings: r.meetings?.map(summarizeMeeting) };
    }));

    this.server.tool('papra_get_meeting', 'Get meeting details with summary (no chunks). Use get_meeting_transcript for chunks.', {
      meetingId: z.string(),
    }, async ({ meetingId }) => runTool(env, email, async () => {
      const r = await papraFetch(env, `/api/organizations/${orgId}/meetings/${meetingId}`, { method: 'GET' });
      const m = r.meeting;
      return { ...summarizeMeeting(m), sourceName: m.sourceName, summary: m.summary, chunksCount: m.chunks?.length ?? 0 };
    }));

    this.server.tool('papra_get_meeting_transcript', 'Get meeting transcript chunks with pagination', {
      meetingId: z.string(), offset: z.number().default(0), limit: z.number().default(30).describe('Max chunks (0=all)'),
    }, async ({ meetingId, offset, limit }) => runTool(env, email, async () => {
      const r = await papraFetch(env, `/api/organizations/${orgId}/meetings/${meetingId}`, { method: 'GET' });
      const chunks = r.meeting.chunks ?? [];
      const slice = limit > 0 ? chunks.slice(offset, offset + limit) : chunks.slice(offset);
      return {
        id: r.meeting.id, title: r.meeting.title, totalChunks: chunks.length,
        offset, hasMore: offset + slice.length < chunks.length,
        chunks: slice.map((c: any) => ({ speaker: c.speaker, startedAtMs: c.startedAtMs, endedAtMs: c.endedAtMs, content: c.content })),
      };
    }));

    this.server.tool('papra_get_meeting_stats', 'Get meeting statistics', {}, async () => runTool(env, email, async () =>
      papraFetch(env, `/api/organizations/${orgId}/meetings/stats`, { method: 'GET' }),
    ));

    this.server.tool('papra_search_meetings', 'Search meetings', {
      searchQuery: z.string(), pageIndex: z.number().default(0), pageSize: z.number().default(20),
    }, async ({ searchQuery, pageIndex, pageSize }) => runTool(env, email, async () =>
      papraFetch(env, `/api/organizations/${orgId}/meetings/search`, { method: 'GET', query: { searchQuery, pageIndex, pageSize } }),
    ));

    this.server.tool('papra_ingest_meeting', 'Ingest a meeting transcript', {
      title: z.string().min(1).max(256),
      sourceStorageKey: z.string().min(1).max(1024),
      sourceName: z.string().max(256).optional(),
      transcriptStorageKey: z.string().max(1024).optional(),
      rawTranscriptStorageKey: z.string().max(1024).optional(),
      language: z.string().max(32).optional(),
      context: z.string().max(64).optional(),
      summary: z.string().max(10000).optional(),
      startedAt: z.string().optional(),
      endedAt: z.string().optional(),
      chunks: z.array(meetingChunkSchema).min(1).max(10000),
    }, async (meeting) => runTool(env, email, async () =>
      papraFetch(env, `/api/organizations/${orgId}/meetings/ingest`, { method: 'POST', body: JSON.stringify(meeting) }),
    ));

    this.server.tool('papra_retranscribe_meeting', 'Re-transcribe a meeting', {
      meetingId: z.string(),
    }, async ({ meetingId }) => runTool(env, email, async () =>
      papraFetch(env, `/api/organizations/${orgId}/meetings/${meetingId}/retranscribe`, { method: 'POST' }),
    ));

    this.server.tool('papra_delete_meeting', 'Delete a meeting', {
      meetingId: z.string(),
    }, async ({ meetingId }) => runTool(env, email, async () => {
      await papraFetch(env, `/api/organizations/${orgId}/meetings/${meetingId}`, { method: 'DELETE' });
      return { ok: true };
    }));

    // --- Share Links ---
    this.server.tool('papra_list_share_links', 'List active share links', {
      resourceId: z.string().optional(), resourceType: z.enum(['document', 'meeting']).optional(),
    }, async ({ resourceId, resourceType }) => runTool(env, email, async () =>
      papraFetch(env, `/api/organizations/${orgId}/share-links`, { method: 'GET', query: { resourceId, resourceType } }),
    ));

    this.server.tool('papra_create_share_link', 'Create a share link', {
      documentId: z.string().optional(), meetingId: z.string().optional(),
      expiresAt: z.string().optional(), password: z.string().optional(),
    }, async (payload) => runTool(env, email, async () =>
      papraFetch(env, `/api/organizations/${orgId}/share-links`, { method: 'POST', body: JSON.stringify(payload) }),
    ));

    this.server.tool('papra_revoke_share_link', 'Revoke a share link', {
      shareLinkId: z.string(),
    }, async ({ shareLinkId }) => runTool(env, email, async () => {
      await papraFetch(env, `/api/organizations/${orgId}/share-links/${shareLinkId}`, { method: 'DELETE' });
      return { ok: true };
    }));

    // --- Audit Log ---
    this.server.tool('papra_get_audit_log', 'Get security audit log', {
      pageIndex: z.number().default(0), pageSize: z.number().default(20),
    }, async ({ pageIndex, pageSize }) => runTool(env, email, async () =>
      papraFetch(env, `/api/organizations/${orgId}/audit-log`, { method: 'GET', query: { pageIndex, pageSize } }),
    ));

    // --- Document Versions ---
    this.server.tool('papra_list_document_versions', 'List document versions', {
      documentId: z.string(),
    }, async ({ documentId }) => runTool(env, email, async () =>
      papraFetch(env, `/api/organizations/${orgId}/documents/${documentId}/versions`, { method: 'GET' }),
    ));

    // --- API Key ---
    this.server.tool('papra_get_current_api_key', 'Get current API key info', {}, async () => runTool(env, email, async () =>
      papraFetch(env, '/api/api-keys/current', { method: 'GET' }),
    ));

    this.server.tool('papra_list_organizations', 'List organizations', {}, async () => runTool(env, email, async () =>
      papraFetch(env, '/api/organizations', { method: 'GET' }),
    ));
  }
}

// ==================== OAuth + Export ====================

// @ts-expect-error — handleAccessRequest is defined in the original Worker bundle
async function handleAccessRequest(request: Request, env: Env) {
  return new Response('Papra MCP Server v1.2.0', { status: 200 });
}

export default new OAuthProvider({
  apiHandler: MyMCP.serve('/mcp'),
  apiRoute: '/mcp',
  authorizeEndpoint: '/authorize',
  clientRegistrationEndpoint: '/register',
  defaultHandler: { fetch: handleAccessRequest },
  tokenEndpoint: '/token',
});
