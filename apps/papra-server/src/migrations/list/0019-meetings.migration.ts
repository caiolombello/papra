import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const meetingsMigration = {
  name: 'meetings',

  up: async ({ db }) => {
    await db.batch([
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "meetings" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "created_by" text REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
          "title" text NOT NULL,
          "source_name" text,
          "source_storage_key" text,
          "transcript_storage_key" text,
          "raw_transcript_storage_key" text,
          "language" text,
          "context" text,
          "summary" text,
          "started_at" integer,
          "ended_at" integer
        )
      `),
      db.run(sql`CREATE INDEX IF NOT EXISTS "meetings_organization_id_created_at_index" ON "meetings" ("organization_id","created_at")`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "meetings_organization_id_started_at_index" ON "meetings" ("organization_id","started_at")`),
      db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "meetings_organization_id_source_storage_key_unique" ON "meetings" ("organization_id","source_storage_key")`),
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "meeting_chunks" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "meeting_id" text NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "chunk_index" integer NOT NULL,
          "speaker" text,
          "started_at_ms" integer,
          "ended_at_ms" integer,
          "content" text NOT NULL
        )
      `),
      db.run(sql`CREATE INDEX IF NOT EXISTS "meeting_chunks_meeting_id_chunk_index_index" ON "meeting_chunks" ("meeting_id","chunk_index")`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "meeting_chunks_organization_id_index" ON "meeting_chunks" ("organization_id")`),
      db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "meeting_chunks_meeting_id_chunk_index_unique" ON "meeting_chunks" ("meeting_id","chunk_index")`),
      db.run(sql`DROP TABLE IF EXISTS meeting_chunks_fts`),
      db.run(sql`CREATE VIRTUAL TABLE IF NOT EXISTS meeting_chunks_fts USING fts5(chunk_id UNINDEXED, meeting_id UNINDEXED, organization_id UNINDEXED, speaker, content, prefix='2 3 4')`),
      db.run(sql`INSERT INTO meeting_chunks_fts(chunk_id, meeting_id, organization_id, speaker, content) SELECT id, meeting_id, organization_id, coalesce(speaker, ''), content FROM meeting_chunks`),
      db.run(sql`
        CREATE TRIGGER IF NOT EXISTS trigger_meeting_chunks_fts_insert AFTER INSERT ON meeting_chunks BEGIN
          INSERT INTO meeting_chunks_fts(chunk_id, meeting_id, organization_id, speaker, content)
          VALUES (new.id, new.meeting_id, new.organization_id, coalesce(new.speaker, ''), new.content);
        END
      `),
      db.run(sql`
        CREATE TRIGGER IF NOT EXISTS trigger_meeting_chunks_fts_update AFTER UPDATE ON meeting_chunks BEGIN
          UPDATE meeting_chunks_fts
          SET meeting_id = new.meeting_id,
              organization_id = new.organization_id,
              speaker = coalesce(new.speaker, ''),
              content = new.content
          WHERE chunk_id = new.id;
        END
      `),
      db.run(sql`
        CREATE TRIGGER IF NOT EXISTS trigger_meeting_chunks_fts_delete AFTER DELETE ON meeting_chunks BEGIN
          DELETE FROM meeting_chunks_fts WHERE chunk_id = old.id;
        END
      `),
    ]);
  },

  down: async ({ db }) => {
    await db.batch([
      db.run(sql`DROP TRIGGER IF EXISTS trigger_meeting_chunks_fts_insert`),
      db.run(sql`DROP TRIGGER IF EXISTS trigger_meeting_chunks_fts_update`),
      db.run(sql`DROP TRIGGER IF EXISTS trigger_meeting_chunks_fts_delete`),
      db.run(sql`DROP TABLE IF EXISTS "meeting_chunks_fts"`),
      db.run(sql`DROP TABLE IF EXISTS "meeting_chunks"`),
      db.run(sql`DROP TABLE IF EXISTS "meetings"`),
    ]);
  },
} satisfies Migration;
