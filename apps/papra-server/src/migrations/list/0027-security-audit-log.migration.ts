import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const securityAuditLogMigration = {
  name: 'security-audit-log',

  up: async ({ db }) => {
    await db.batch([
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "security_audit_log" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "organization_id" text REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "user_id" text,
          "action" text NOT NULL,
          "resource_type" text NOT NULL,
          "resource_id" text,
          "ip_address" text,
          "user_agent" text,
          "details" text
        )
      `),
      db.run(sql`CREATE INDEX IF NOT EXISTS "security_audit_log_org_created_index" ON "security_audit_log" ("organization_id", "created_at")`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "security_audit_log_user_created_index" ON "security_audit_log" ("user_id", "created_at")`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "security_audit_log_action_index" ON "security_audit_log" ("action")`),
    ]);
  },

  down: async ({ db }) => {
    await db.batch([
      db.run(sql`DROP INDEX IF EXISTS "security_audit_log_action_index"`),
      db.run(sql`DROP INDEX IF EXISTS "security_audit_log_user_created_index"`),
      db.run(sql`DROP INDEX IF EXISTS "security_audit_log_org_created_index"`),
      db.run(sql`DROP TABLE IF EXISTS "security_audit_log"`),
    ]);
  },
} satisfies Migration;
