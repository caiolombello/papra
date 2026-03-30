import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const documentFoldersMigration = {
  name: 'document-folders',

  up: async ({ db }) => {
    await db.batch([
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "document_folders" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "parent_id" text REFERENCES "document_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "name" text NOT NULL
        )
      `),
      db.run(sql`CREATE INDEX IF NOT EXISTS "document_folders_organization_id_parent_id_index" ON "document_folders" ("organization_id", "parent_id")`),
      db.run(sql`ALTER TABLE "documents" ADD COLUMN "folder_id" text REFERENCES "document_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE`),
      db.run(sql`CREATE INDEX IF NOT EXISTS "documents_folder_id_index" ON "documents" ("folder_id")`),
    ]);
  },

  down: async ({ db }) => {
    await db.batch([
      db.run(sql`DROP INDEX IF EXISTS "documents_folder_id_index"`),
      // SQLite doesn't support DROP COLUMN before 3.35, but we include it for completeness
      db.run(sql`ALTER TABLE "documents" DROP COLUMN "folder_id"`),
      db.run(sql`DROP INDEX IF EXISTS "document_folders_organization_id_parent_id_index"`),
      db.run(sql`DROP TABLE IF EXISTS "document_folders"`),
    ]);
  },
} satisfies Migration;
