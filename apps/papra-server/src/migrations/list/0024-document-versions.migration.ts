import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const documentVersionsMigration = {
  name: 'document-versions',

  up: async ({ db }) => {
    await db.batch([
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "document_versions" (
          "id" text PRIMARY KEY NOT NULL,
          "created_at" integer NOT NULL,
          "updated_at" integer NOT NULL,
          "document_id" text NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "version_number" integer NOT NULL,
          "original_name" text NOT NULL,
          "original_size" integer NOT NULL DEFAULT 0,
          "original_storage_key" text NOT NULL,
          "original_sha256_hash" text NOT NULL,
          "mime_type" text NOT NULL,
          "created_by" text,
          "file_encryption_key_wrapped" text,
          "file_encryption_kek_version" text,
          "file_encryption_algorithm" text
        )
      `),
      db.run(sql`CREATE INDEX IF NOT EXISTS "document_versions_document_id_version_index" ON "document_versions" ("document_id", "version_number")`),
      db.run(sql`ALTER TABLE "documents" ADD COLUMN "version_number" integer NOT NULL DEFAULT 1`),
    ]);
  },

  down: async ({ db }) => {
    await db.batch([
      db.run(sql`ALTER TABLE "documents" DROP COLUMN "version_number"`),
      db.run(sql`DROP INDEX IF EXISTS "document_versions_document_id_version_index"`),
      db.run(sql`DROP TABLE IF EXISTS "document_versions"`),
    ]);
  },
} satisfies Migration;
