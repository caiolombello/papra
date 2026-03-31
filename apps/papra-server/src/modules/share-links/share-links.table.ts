import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { organizationsTable } from '../organizations/organizations.table';
import { generateId } from '../shared/random/ids';

export const shareLinksTable = sqliteTable('share_links', {
  id: text('id').primaryKey().$defaultFn(() => generateId({ prefix: 'shr' })),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  createdBy: text('created_by'),
  token: text('token').notNull().unique(),
  resourceType: text('resource_type').notNull(), // 'document' | 'meeting'
  resourceId: text('resource_id').notNull(),
  passwordHash: text('password_hash'),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  maxViews: integer('max_views'),
  viewCount: integer('view_count').notNull().default(0),
  isRevoked: integer('is_revoked', { mode: 'boolean' }).notNull().default(false),
}, table => [
  uniqueIndex('share_links_token_index').on(table.token),
  index('share_links_resource_index').on(table.resourceType, table.resourceId),
]);
