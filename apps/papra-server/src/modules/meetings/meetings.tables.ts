import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { usersTable } from '../users/users.table';
import { generateMeetingChunkId, generateMeetingId } from './meetings.models';

export const meetingsTable = sqliteTable('meetings', {
  ...createPrimaryKeyField({ idGenerator: generateMeetingId }),
  ...createTimestampColumns(),

  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  createdBy: text('created_by').references(() => usersTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),

  title: text('title').notNull(),
  sourceName: text('source_name'),
  sourceStorageKey: text('source_storage_key'),
  transcriptStorageKey: text('transcript_storage_key'),
  rawTranscriptStorageKey: text('raw_transcript_storage_key'),
  language: text('language'),
  context: text('context'),
  summary: text('summary'),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }),
  endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
}, table => [
  index('meetings_organization_id_created_at_index').on(table.organizationId, table.createdAt),
  index('meetings_organization_id_started_at_index').on(table.organizationId, table.startedAt),
  uniqueIndex('meetings_organization_id_source_storage_key_unique').on(table.organizationId, table.sourceStorageKey),
]);

export const meetingChunksTable = sqliteTable('meeting_chunks', {
  ...createPrimaryKeyField({ idGenerator: generateMeetingChunkId }),
  ...createTimestampColumns(),

  meetingId: text('meeting_id').notNull().references(() => meetingsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

  chunkIndex: integer('chunk_index').notNull(),
  speaker: text('speaker'),
  startedAtMs: integer('started_at_ms'),
  endedAtMs: integer('ended_at_ms'),
  content: text('content').notNull(),
}, table => [
  index('meeting_chunks_meeting_id_chunk_index_index').on(table.meetingId, table.chunkIndex),
  index('meeting_chunks_organization_id_index').on(table.organizationId),
  uniqueIndex('meeting_chunks_meeting_id_chunk_index_unique').on(table.meetingId, table.chunkIndex),
]);

export const meetingChunksFtsTable = sqliteTable('meeting_chunks_fts', {
  chunkId: text('chunk_id').notNull(),
  meetingId: text('meeting_id').notNull(),
  organizationId: text('organization_id').notNull(),
  speaker: text('speaker'),
  content: text('content').notNull(),
});
