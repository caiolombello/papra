import { integer, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { meetingsTable } from '../meetings.tables';
import { organizationsTable } from '../../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../../shared/db/columns.helpers';
import { generateId } from '../../shared/random/ids';

export const meetingTranslationsTable = sqliteTable('meeting_translations', {
  ...createPrimaryKeyField({ idGenerator: () => generateId({ prefix: 'mtrl' }) }),
  ...createTimestampColumns(),

  meetingId: text('meeting_id').notNull().references(() => meetingsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  sourceLanguage: text('source_language').notNull(),
  targetLanguage: text('target_language').notNull(),
  status: text('status').notNull().default('pending'),
}, table => [
  index('meeting_translations_meeting_id_index').on(table.meetingId),
  uniqueIndex('meeting_translations_meeting_target_unique').on(table.meetingId, table.targetLanguage),
]);

export const meetingTranslationChunksTable = sqliteTable('meeting_translation_chunks', {
  ...createPrimaryKeyField({ idGenerator: () => generateId({ prefix: 'mtrc' }) }),
  ...createTimestampColumns(),

  translationId: text('translation_id').notNull().references(() => meetingTranslationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  speaker: text('speaker'),
  content: text('content').notNull(),
}, table => [
  uniqueIndex('meeting_translation_chunks_translation_chunk_unique').on(table.translationId, table.chunkIndex),
]);
