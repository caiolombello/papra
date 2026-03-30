import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const meetingsStatusMigration = {
  name: 'meetings-status',

  up: async ({ db }) => {
    await db.batch([
      db.run(sql`ALTER TABLE "meetings" ADD COLUMN "status" text NOT NULL DEFAULT 'completed'`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "meetings_organization_id_status_index" ON "meetings" ("organization_id","status")`),
    ]);
  },

  down: async ({ db }) => {
    await db.batch([
      db.run(sql`DROP INDEX IF EXISTS "meetings_organization_id_status_index"`),
      db.run(sql`ALTER TABLE "meetings" DROP COLUMN "status"`),
    ]);
  },
} satisfies Migration;
