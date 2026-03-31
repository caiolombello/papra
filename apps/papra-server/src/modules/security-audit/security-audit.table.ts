import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField } from '../shared/db/columns.helpers';
import { generateId } from '../shared/random/ids';

export const securityAuditLogTable = sqliteTable('security_audit_log', {
  id: text('id').primaryKey().$defaultFn(() => generateId({ prefix: 'aud' })),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  organizationId: text('organization_id').references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  userId: text('user_id'),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  details: text('details'),
}, table => [
  index('security_audit_log_org_created_index').on(table.organizationId, table.createdAt),
  index('security_audit_log_user_created_index').on(table.userId, table.createdAt),
  index('security_audit_log_action_index').on(table.action),
]);
