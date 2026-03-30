import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { documentsTable } from '../documents/documents.table';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { generateId } from '../shared/random/ids';
import { DOCUMENT_VERSION_ID_PREFIX } from './document-versions.constants';

export const documentVersionsTable = sqliteTable('document_versions', {
  ...createPrimaryKeyField({ idGenerator: () => generateId({ prefix: DOCUMENT_VERSION_ID_PREFIX }) }),
  ...createTimestampColumns(),

  documentId: text('document_id').notNull().references(() => documentsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  versionNumber: integer('version_number').notNull(),
  originalName: text('original_name').notNull(),
  originalSize: integer('original_size').notNull().default(0),
  originalStorageKey: text('original_storage_key').notNull(),
  originalSha256Hash: text('original_sha256_hash').notNull(),
  mimeType: text('mime_type').notNull(),
  createdBy: text('created_by'),
  fileEncryptionKeyWrapped: text('file_encryption_key_wrapped'),
  fileEncryptionKekVersion: text('file_encryption_kek_version'),
  fileEncryptionAlgorithm: text('file_encryption_algorithm'),
}, table => [
  index('document_versions_document_id_version_index').on(table.documentId, table.versionNumber),
]);
