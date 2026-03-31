import type { Context } from 'hono';
import type { Database } from '../app/database/database.types';
import { securityAuditLogTable } from './security-audit.table';

export type AuditAction =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.login_failed'
  | 'auth.2fa_enabled'
  | 'auth.2fa_disabled'
  | 'auth.password_changed'
  | 'document.viewed'
  | 'document.downloaded'
  | 'document.created'
  | 'document.deleted'
  | 'document.updated'
  | 'meeting.viewed'
  | 'meeting.created'
  | 'meeting.deleted'
  | 'meeting.retranscribed'
  | 'api_key.created'
  | 'api_key.deleted'
  | 'api_key.used'
  | 'folder.created'
  | 'folder.deleted'
  | 'settings.updated';

export type AuditEntry = {
  organizationId?: string;
  userId?: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
};

export function createAuditLogger({ db }: { db: Database }) {
  return {
    log: async (entry: AuditEntry) => {
      try {
        await db.insert(securityAuditLogTable).values({
          organizationId: entry.organizationId,
          userId: entry.userId,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          details: entry.details ? JSON.stringify(entry.details) : undefined,
        });
      } catch {
        // Audit logging should never break the request
      }
    },

    logFromContext: async (context: Context, entry: Omit<AuditEntry, 'ipAddress' | 'userAgent'>) => {
      const ipAddress = context.req.header('x-forwarded-for')?.split(',')[0]?.trim()
        ?? context.req.header('x-real-ip')
        ?? 'unknown';
      const userAgent = context.req.header('user-agent') ?? 'unknown';

      try {
        await db.insert(securityAuditLogTable).values({
          organizationId: entry.organizationId,
          userId: entry.userId,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          ipAddress,
          userAgent,
          details: entry.details ? JSON.stringify(entry.details) : undefined,
        });
      } catch {
        // Audit logging should never break the request
      }
    },
  };
}
