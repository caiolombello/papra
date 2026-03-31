import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const shareLinksMigration = {
  name: 'share-links',

  up: async ({ db }) => {
    await db.batch([
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "share_links" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "created_by" text,
          "token" text NOT NULL UNIQUE,
          "resource_type" text NOT NULL,
          "resource_id" text NOT NULL,
          "password_hash" text,
          "expires_at" integer NOT NULL,
          "max_views" integer,
          "view_count" integer NOT NULL DEFAULT 0,
          "is_revoked" integer NOT NULL DEFAULT 0
        )
      `),
      db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "share_links_token_index" ON "share_links" ("token")`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "share_links_resource_index" ON "share_links" ("resource_type", "resource_id")`),
    ]);
  },

  down: async ({ db }) => {
    await db.batch([
      db.run(sql`DROP INDEX IF EXISTS "share_links_resource_index"`),
      db.run(sql`DROP INDEX IF EXISTS "share_links_token_index"`),
      db.run(sql`DROP TABLE IF EXISTS "share_links"`),
    ]);
  },
} satisfies Migration;
