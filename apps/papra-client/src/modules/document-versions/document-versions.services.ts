import { apiClient } from '../shared/http/api-client';
import { coerceDates } from '../shared/http/http-client.models';

export type DocumentVersion = {
  id: string;
  documentId: string;
  organizationId: string;
  versionNumber: number;
  originalName: string;
  originalSize: number;
  originalStorageKey: string;
  originalSha256Hash: string;
  mimeType: string;
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function fetchDocumentVersions({
  organizationId,
  documentId,
}: {
  organizationId: string;
  documentId: string;
}) {
  const { versions } = await apiClient<{ versions: any[] }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/documents/${documentId}/versions`,
  });

  return { versions: versions.map(coerceDates) as DocumentVersion[] };
}
