import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const meetingsTagsMigration = {
  name: 'meetings-tags',

  up: async ({ db }) => {
    await db.batch([
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "meetings_tags" (
          "meeting_id" text NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "tag_id" text NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          PRIMARY KEY ("meeting_id", "tag_id")
        )
      `),
    ]);
  },

  down: async ({ db }) => {
    await db.batch([
      db.run(sql`DROP TABLE IF EXISTS "meetings_tags"`),
    ]);
  },
} satisfies Migration;
