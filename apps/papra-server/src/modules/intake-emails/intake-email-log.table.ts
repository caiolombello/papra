import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { organizationsTable } from '../organizations/organizations.table';
import { generateId } from '../shared/random/ids';

export const intakeEmailLogTable = sqliteTable('intake_email_log', {
  id: text('id').primaryKey().$defaultFn(() => generateId({ prefix: 'iel' })),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  intakeEmailId: text('intake_email_id'),
  fromAddress: text('from_address').notNull(),
  subject: text('subject').notNull().default(''),
  attachmentsCount: integer('attachments_count').notNull().default(0),
  status: text('status').notNull().default('success'), // 'success' | 'partial' | 'failed'
  errorMessage: text('error_message'),
  documentIds: text('document_ids'), // JSON array of created doc IDs
  rawEmailKey: text('raw_email_key'), // S3 key for raw email
}, table => [
  index('intake_email_log_org_created_index').on(table.organizationId, table.createdAt),
  index('intake_email_log_dedup_index').on(table.fromAddress, table.subject, table.status, table.createdAt),
]);
