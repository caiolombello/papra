import { apiClient } from '../shared/http/api-client';
import { coerceDates } from '../shared/http/http-client.models';

export type DocumentFolder = {
  id: string;
  organizationId: string;
  parentId: string | null;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

export type FolderBreadcrumb = {
  id: string;
  name: string;
  parentId: string | null;
};

export async function fetchFolders({ organizationId, parentId }: { organizationId: string; parentId?: string | null }) {
  const query: Record<string, string> = {};
  if (parentId) {
    query.parentId = parentId;
  }

  const { folders } = await apiClient<{ folders: any[] }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/folders`,
    query,
  });

  return { folders: folders.map(coerceDates) as DocumentFolder[] };
}

export async function fetchFolder({ organizationId, folderId }: { organizationId: string; folderId: string }) {
  const { folder, path } = await apiClient<{ folder: any; path: FolderBreadcrumb[] }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/folders/${folderId}`,
  });

  return { folder: coerceDates(folder) as DocumentFolder, path };
}

export async function createFolder({ organizationId, name, parentId }: { organizationId: string; name: string; parentId?: string | null }) {
  const { folder } = await apiClient<{ folder: any }>({
    method: 'POST',
    path: `/api/organizations/${organizationId}/folders`,
    body: { name, parentId: parentId ?? null },
  });

  return { folder: coerceDates(folder) as DocumentFolder };
}

export async function renameFolder({ organizationId, folderId, name }: { organizationId: string; folderId: string; name: string }) {
  const { folder } = await apiClient<{ folder: any }>({
    method: 'PATCH',
    path: `/api/organizations/${organizationId}/folders/${folderId}`,
    body: { name },
  });

  return { folder: coerceDates(folder) as DocumentFolder };
}

export async function deleteFolder({ organizationId, folderId }: { organizationId: string; folderId: string }) {
  await apiClient({
    method: 'DELETE',
    path: `/api/organizations/${organizationId}/folders/${folderId}`,
  });
}
