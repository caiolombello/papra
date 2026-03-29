import type {
  PapraCustomPropertyDefinition,
  PapraDocument,
  PapraDocumentCustomProperty,
  PapraMeeting,
  PapraMeetingForCreation,
  PapraMeetingForIngestion,
  PapraMeetingForUpdate,
  PapraUnifiedSearchResult,
  PapraUnifiedSearchScope,
  PapraTag,
  PapraTaggingRule,
  PapraTaggingRuleForCreation,
} from './api-client.types';
import type { ApiClient } from './http-client';
import { injectArguments } from '@corentinth/chisels';
import { createApiClient } from './http-client';

export const PAPRA_API_URL = 'https://api.papra.app';

export type Client = ReturnType<typeof createClient>;

export function createClient({ apiKey, apiBaseUrl = PAPRA_API_URL }: { apiKey: string; apiBaseUrl?: string }) {
  const { apiClient } = createApiClient({ apiKey, apiBaseUrl });

  const methods = injectArguments(
    {
      uploadDocument,
      search,
      listMeetings,
      getMeeting,
      createMeeting,
      ingestMeeting,
      updateMeeting,
      deleteMeeting,
      searchMeetings,
      listOrganizations,
      listTags,
      createTag,
      addTagToDocument,
      listCustomProperties,
      getCustomProperty,
      createCustomProperty,
      updateCustomProperty,
      deleteCustomProperty,
      listDocumentCustomProperties,
      setDocumentCustomProperty,
      deleteDocumentCustomProperty,
      listTaggingRules,
      getTaggingRule,
      createTaggingRule,
      updateTaggingRule,
      deleteTaggingRule,
      applyTaggingRuleToExistingDocuments,
      getCurrentApiKey,
    },
    { apiClient },
  );

  return {
    ...methods,
    forOrganization: (organizationId: string) => injectArguments(methods, { organizationId }),
  };
}

async function uploadDocument({
  file,
  organizationId,
  apiClient,
}: { file: File; organizationId: string; apiClient: ApiClient }) {
  const formData = new FormData();
  formData.append('file', file);

  return await apiClient<{ document: PapraDocument }>(`/api/organizations/${organizationId}/documents`, {
    method: 'POST',
    body: formData,
  });
}

async function search({
  organizationId,
  searchQuery,
  scope = 'all',
  pageIndex = 0,
  pageSize = 20,
  apiClient,
}: {
  organizationId: string;
  searchQuery: string;
  scope?: PapraUnifiedSearchScope;
  pageIndex?: number;
  pageSize?: number;
  apiClient: ApiClient;
}) {
  const searchParams = new URLSearchParams({
    searchQuery,
    scope,
    pageIndex: String(pageIndex),
    pageSize: String(pageSize),
  });

  return await apiClient<PapraUnifiedSearchResult>(`/api/organizations/${organizationId}/search?${searchParams.toString()}`, {
    method: 'GET',
  });
}

async function listMeetings({
  organizationId,
  pageIndex = 0,
  pageSize = 100,
  apiClient,
}: {
  organizationId: string;
  pageIndex?: number;
  pageSize?: number;
  apiClient: ApiClient;
}) {
  const searchParams = new URLSearchParams({
    pageIndex: String(pageIndex),
    pageSize: String(pageSize),
  });

  return await apiClient<{ meetings: PapraMeeting[]; meetingsCount: number }>(`/api/organizations/${organizationId}/meetings?${searchParams.toString()}`, {
    method: 'GET',
  });
}

async function getMeeting({
  organizationId,
  meetingId,
  apiClient,
}: {
  organizationId: string;
  meetingId: string;
  apiClient: ApiClient;
}) {
  return await apiClient<{ meeting: PapraMeeting }>(`/api/organizations/${organizationId}/meetings/${meetingId}`, {
    method: 'GET',
  });
}

async function createMeeting({
  organizationId,
  meeting,
  apiClient,
}: {
  organizationId: string;
  meeting: PapraMeetingForCreation;
  apiClient: ApiClient;
}) {
  return await apiClient<{ meeting: PapraMeeting }>(`/api/organizations/${organizationId}/meetings`, {
    method: 'POST',
    body: meeting,
  });
}

async function ingestMeeting({
  organizationId,
  meeting,
  apiClient,
}: {
  organizationId: string;
  meeting: PapraMeetingForIngestion;
  apiClient: ApiClient;
}) {
  return await apiClient<{ meeting: PapraMeeting; mode: 'created' | 'updated' }>(`/api/organizations/${organizationId}/meetings/ingest`, {
    method: 'POST',
    body: meeting,
  });
}

async function updateMeeting({
  organizationId,
  meetingId,
  meeting,
  apiClient,
}: {
  organizationId: string;
  meetingId: string;
  meeting: PapraMeetingForUpdate;
  apiClient: ApiClient;
}) {
  return await apiClient<{ meeting: PapraMeeting }>(`/api/organizations/${organizationId}/meetings/${meetingId}`, {
    method: 'PATCH',
    body: meeting,
  });
}

async function deleteMeeting({
  organizationId,
  meetingId,
  apiClient,
}: {
  organizationId: string;
  meetingId: string;
  apiClient: ApiClient;
}) {
  return await apiClient<void>(`/api/organizations/${organizationId}/meetings/${meetingId}`, {
    method: 'DELETE',
  });
}

async function searchMeetings({
  organizationId,
  searchQuery,
  pageIndex = 0,
  pageSize = 100,
  apiClient,
}: {
  organizationId: string;
  searchQuery: string;
  pageIndex?: number;
  pageSize?: number;
  apiClient: ApiClient;
}) {
  const searchParams = new URLSearchParams({
    searchQuery,
    pageIndex: String(pageIndex),
    pageSize: String(pageSize),
  });

  return await apiClient<{ meetings: PapraMeeting[]; totalCount: number }>(`/api/organizations/${organizationId}/meetings/search?${searchParams.toString()}`, {
    method: 'GET',
  });
}

async function listOrganizations({ apiClient }: { apiClient: ApiClient }) {
  return await apiClient<{ organizations: { id: string; name: string }[] }>('/api/organizations', {
    method: 'GET',
  });
}

async function listTags({
  organizationId,
  apiClient,
}: { organizationId: string; apiClient: ApiClient }) {
  return await apiClient<{ tags: PapraTag[] }>(`/api/organizations/${organizationId}/tags`, {
    method: 'GET',
  });
}

async function createTag({
  organizationId,
  name,
  color,
  description,
  apiClient,
}: {
  organizationId: string;
  name: string;
  color: string;
  description?: string;
  apiClient: ApiClient;
}) {
  return await apiClient<{ tag: PapraTag }>(`/api/organizations/${organizationId}/tags`, {
    method: 'POST',
    body: { name, color, description },
  });
}

async function addTagToDocument({
  organizationId,
  documentId,
  tagId,
  apiClient,
}: {
  organizationId: string;
  documentId: string;
  tagId: string;
  apiClient: ApiClient;
}) {
  return await apiClient<void>(`/api/organizations/${organizationId}/documents/${documentId}/tags`, {
    method: 'POST',
    body: { tagId },
  });
}

async function getCurrentApiKey({ apiClient }: { apiClient: ApiClient }) {
  return await apiClient<{
    apiKey: {
      id: string;
      name: string;
      permissions: string[];
    };
  }>('/api/api-keys/current', {
    method: 'GET',
  });
}

async function listCustomProperties({
  organizationId,
  apiClient,
}: {
  organizationId: string;
  apiClient: ApiClient;
}) {
  return await apiClient<{ propertyDefinitions: PapraCustomPropertyDefinition[] }>(`/api/organizations/${organizationId}/custom-properties`, {
    method: 'GET',
  });
}

async function getCustomProperty({
  organizationId,
  propertyDefinitionId,
  apiClient,
}: {
  organizationId: string;
  propertyDefinitionId: string;
  apiClient: ApiClient;
}) {
  return await apiClient<{ definition: PapraCustomPropertyDefinition }>(`/api/organizations/${organizationId}/custom-properties/${propertyDefinitionId}`, {
    method: 'GET',
  });
}

async function createCustomProperty({
  organizationId,
  propertyDefinition,
  apiClient,
}: {
  organizationId: string;
  propertyDefinition: {
    name: string;
    description?: string;
    type: PapraCustomPropertyDefinition['type'];
    options?: { id?: string; name: string }[];
  };
  apiClient: ApiClient;
}) {
  return await apiClient<{ propertyDefinition: PapraCustomPropertyDefinition }>(`/api/organizations/${organizationId}/custom-properties`, {
    method: 'POST',
    body: propertyDefinition,
  });
}

async function updateCustomProperty({
  organizationId,
  propertyDefinitionId,
  propertyDefinition,
  apiClient,
}: {
  organizationId: string;
  propertyDefinitionId: string;
  propertyDefinition: {
    name?: string;
    description?: string;
    options?: { id?: string; name: string }[];
  };
  apiClient: ApiClient;
}) {
  return await apiClient<{ propertyDefinition: PapraCustomPropertyDefinition }>(`/api/organizations/${organizationId}/custom-properties/${propertyDefinitionId}`, {
    method: 'PUT',
    body: propertyDefinition,
  });
}

async function deleteCustomProperty({
  organizationId,
  propertyDefinitionId,
  apiClient,
}: {
  organizationId: string;
  propertyDefinitionId: string;
  apiClient: ApiClient;
}) {
  return await apiClient<void>(`/api/organizations/${organizationId}/custom-properties/${propertyDefinitionId}`, {
    method: 'DELETE',
  });
}

async function listDocumentCustomProperties({
  organizationId,
  documentId,
  apiClient,
}: {
  organizationId: string;
  documentId: string;
  apiClient: ApiClient;
}) {
  return await apiClient<{ customProperties: PapraDocumentCustomProperty[] }>(`/api/organizations/${organizationId}/documents/${documentId}/custom-properties`, {
    method: 'GET',
  });
}

async function setDocumentCustomProperty({
  organizationId,
  documentId,
  propertyDefinitionId,
  value,
  apiClient,
}: {
  organizationId: string;
  documentId: string;
  propertyDefinitionId: string;
  value: unknown;
  apiClient: ApiClient;
}) {
  return await apiClient<void>(`/api/organizations/${organizationId}/documents/${documentId}/custom-properties/${propertyDefinitionId}`, {
    method: 'PUT',
    body: { value },
  });
}

async function deleteDocumentCustomProperty({
  organizationId,
  documentId,
  propertyDefinitionId,
  apiClient,
}: {
  organizationId: string;
  documentId: string;
  propertyDefinitionId: string;
  apiClient: ApiClient;
}) {
  return await apiClient<void>(`/api/organizations/${organizationId}/documents/${documentId}/custom-properties/${propertyDefinitionId}`, {
    method: 'DELETE',
  });
}

async function listTaggingRules({
  organizationId,
  apiClient,
}: {
  organizationId: string;
  apiClient: ApiClient;
}) {
  return await apiClient<{ taggingRules: PapraTaggingRule[] }>(`/api/organizations/${organizationId}/tagging-rules`, {
    method: 'GET',
  });
}

async function getTaggingRule({
  organizationId,
  taggingRuleId,
  apiClient,
}: {
  organizationId: string;
  taggingRuleId: string;
  apiClient: ApiClient;
}) {
  return await apiClient<{ taggingRule: PapraTaggingRule }>(`/api/organizations/${organizationId}/tagging-rules/${taggingRuleId}`, {
    method: 'GET',
  });
}

async function createTaggingRule({
  organizationId,
  taggingRule,
  apiClient,
}: {
  organizationId: string;
  taggingRule: PapraTaggingRuleForCreation;
  apiClient: ApiClient;
}) {
  return await apiClient<void>(`/api/organizations/${organizationId}/tagging-rules`, {
    method: 'POST',
    body: taggingRule,
  });
}

async function updateTaggingRule({
  organizationId,
  taggingRuleId,
  taggingRule,
  apiClient,
}: {
  organizationId: string;
  taggingRuleId: string;
  taggingRule: PapraTaggingRuleForCreation;
  apiClient: ApiClient;
}) {
  return await apiClient<void>(`/api/organizations/${organizationId}/tagging-rules/${taggingRuleId}`, {
    method: 'PUT',
    body: taggingRule,
  });
}

async function deleteTaggingRule({
  organizationId,
  taggingRuleId,
  apiClient,
}: {
  organizationId: string;
  taggingRuleId: string;
  apiClient: ApiClient;
}) {
  return await apiClient<void>(`/api/organizations/${organizationId}/tagging-rules/${taggingRuleId}`, {
    method: 'DELETE',
  });
}

async function applyTaggingRuleToExistingDocuments({
  organizationId,
  taggingRuleId,
  apiClient,
}: {
  organizationId: string;
  taggingRuleId: string;
  apiClient: ApiClient;
}) {
  return await apiClient<{ taskId: string }>(`/api/organizations/${organizationId}/tagging-rules/${taggingRuleId}/apply`, {
    method: 'POST',
  });
}
