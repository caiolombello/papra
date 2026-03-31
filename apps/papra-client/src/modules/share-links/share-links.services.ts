import { apiClient } from '../shared/http/api-client';

export type ShareLink = {
  id: string;
  createdAt: number;
  token: string;
  resourceType: string;
  resourceId: string;
  hasPassword: boolean;
  expiresAt: number;
  maxViews: number | null;
  viewCount: number;
  isRevoked: boolean;
  isExpired?: boolean;
  isMaxViewsReached?: boolean;
};

export async function createShareLink({
  organizationId,
  resourceType,
  resourceId,
  password,
  expiresInHours,
  maxViews,
}: {
  organizationId: string;
  resourceType: 'document' | 'meeting';
  resourceId: string;
  password?: string;
  expiresInHours?: number;
  maxViews?: number;
}) {
  return apiClient<{ shareLink: ShareLink; shareUrl: string }>({
    method: 'POST',
    path: `/api/organizations/${organizationId}/share-links`,
    body: { resourceType, resourceId, password, expiresInHours, maxViews },
  });
}

export async function listShareLinks({
  organizationId,
  resourceType,
  resourceId,
}: {
  organizationId: string;
  resourceType?: string;
  resourceId?: string;
}) {
  return apiClient<{ links: ShareLink[] }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/share-links`,
    query: { resourceType, resourceId },
  });
}

export async function revokeShareLink({
  organizationId,
  shareLinkId,
}: {
  organizationId: string;
  shareLinkId: string;
}) {
  return apiClient({
    method: 'DELETE',
    path: `/api/organizations/${organizationId}/share-links/${shareLinkId}`,
  });
}
