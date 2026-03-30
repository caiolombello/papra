import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const pdfPasswordRulesMigration = {
  name: 'pdf-password-rules',

  up: async ({ db }) => {
    await db.batch([
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "pdf_password_rules" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "name" text NOT NULL,
          "subject_pattern" text NOT NULL,
          "password" text NOT NULL,
          "enabled" integer NOT NULL DEFAULT 1,
          "priority" integer NOT NULL DEFAULT 0
        )
      `),
      db.run(sql`CREATE INDEX IF NOT EXISTS "pdf_password_rules_organization_id_index" ON "pdf_password_rules" ("organization_id")`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "pdf_password_rules_organization_id_enabled_priority_index" ON "pdf_password_rules" ("organization_id","enabled","priority")`),
    ]);
  },

  down: async ({ db }) => {
    await db.batch([
      db.run(sql`DROP INDEX IF EXISTS "pdf_password_rules_organization_id_enabled_priority_index"`),
      db.run(sql`DROP INDEX IF EXISTS "pdf_password_rules_organization_id_index"`),
      db.run(sql`DROP TABLE IF EXISTS "pdf_password_rules"`),
    ]);
  },
} satisfies Migration;
