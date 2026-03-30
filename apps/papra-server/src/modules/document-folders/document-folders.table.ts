import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { generateId } from '../shared/random/ids';
import { DOCUMENT_FOLDER_ID_PREFIX } from './document-folders.constants';

export const documentFoldersTable = sqliteTable('document_folders', {
  ...createPrimaryKeyField({ idGenerator: () => generateId({ prefix: DOCUMENT_FOLDER_ID_PREFIX }) }),
  ...createTimestampColumns(),

  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  parentId: text('parent_id').references((): any => documentFoldersTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull(),
}, table => [
  index('document_folders_organization_id_parent_id_index').on(table.organizationId, table.parentId),
]);
