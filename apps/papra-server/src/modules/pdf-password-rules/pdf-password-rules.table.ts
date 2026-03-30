import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { generateId } from '../shared/random/ids';
import { PDF_PASSWORD_RULE_ID_PREFIX } from './pdf-password-rules.constants';

export const pdfPasswordRulesTable = sqliteTable('pdf_password_rules', {
  ...createPrimaryKeyField({ idGenerator: () => generateId({ prefix: PDF_PASSWORD_RULE_ID_PREFIX }) }),
  ...createTimestampColumns(),

  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull(),
  subjectPattern: text('subject_pattern').notNull(),
  password: text('password').notNull(),
  enabled: integer('enabled').notNull().default(1),
  priority: integer('priority').notNull().default(0),
}, table => [
  index('pdf_password_rules_organization_id_index').on(table.organizationId),
  index('pdf_password_rules_organization_id_enabled_priority_index').on(table.organizationId, table.enabled, table.priority),
]);
