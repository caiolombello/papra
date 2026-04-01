import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const intakeEmailLogMigration = {
  name: 'intake-email-log',

  up: async ({ db }) => {
    await db.batch([
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "intake_email_log" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "intake_email_id" text,
          "from_address" text NOT NULL,
          "subject" text NOT NULL DEFAULT '',
          "attachments_count" integer NOT NULL DEFAULT 0,
          "status" text NOT NULL DEFAULT 'success',
          "error_message" text,
          "document_ids" text,
          "raw_email_key" text
        )
      `),
      db.run(sql`CREATE INDEX IF NOT EXISTS "intake_email_log_org_created_index" ON "intake_email_log" ("organization_id", "created_at")`),
    ]);
  },

  down: async ({ db }) => {
    await db.batch([
      db.run(sql`DROP INDEX IF EXISTS "intake_email_log_org_created_index"`),
      db.run(sql`DROP TABLE IF EXISTS "intake_email_log"`),
    ]);
  },
} satisfies Migration;
