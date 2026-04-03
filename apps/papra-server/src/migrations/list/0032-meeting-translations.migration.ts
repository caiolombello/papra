import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const meetingTranslationsMigration = {
  name: 'meeting-translations',

  up: async ({ db }) => {
    await db.batch([
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "meeting_translations" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "meeting_id" text NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "source_language" text NOT NULL,
          "target_language" text NOT NULL,
          "status" text NOT NULL DEFAULT 'pending'
        )
      `),
      db.run(sql`CREATE INDEX IF NOT EXISTS "meeting_translations_meeting_id_index" ON "meeting_translations" ("meeting_id")`),
      db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "meeting_translations_meeting_target_unique" ON "meeting_translations" ("meeting_id", "target_language")`),
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "meeting_translation_chunks" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "translation_id" text NOT NULL REFERENCES "meeting_translations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "chunk_index" integer NOT NULL,
          "speaker" text,
          "content" text NOT NULL
        )
      `),
      db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "meeting_translation_chunks_translation_chunk_unique" ON "meeting_translation_chunks" ("translation_id", "chunk_index")`),
    ]);
  },

  down: async ({ db }) => {
    await db.batch([
      db.run(sql`DROP TABLE IF EXISTS "meeting_translation_chunks"`),
      db.run(sql`DROP TABLE IF EXISTS "meeting_translations"`),
    ]);
  },
} satisfies Migration;
