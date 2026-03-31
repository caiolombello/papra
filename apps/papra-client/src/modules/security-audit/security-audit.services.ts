import { apiClient } from '../shared/http/api-client';

export type AuditLogEntry = {
  id: string;
  createdAt: number;
  organizationId: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  details: Record<string, unknown> | null;
};

export async function fetchAuditLog({
  organizationId,
  pageIndex = 0,
  pageSize = 50,
  action,
}: {
  organizationId: string;
  pageIndex?: number;
  pageSize?: number;
  action?: string;
}) {
  return apiClient<{ entries: AuditLogEntry[]; totalCount: number }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/audit-log`,
    query: { pageIndex, pageSize, ...(action ? { action } : {}) },
  });
}
