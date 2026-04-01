import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const taggingRulesFolderActionMigration = {
  name: 'tagging-rules-folder-action',

  up: async ({ db }) => {
    await db.run(sql`ALTER TABLE "tagging_rules" ADD COLUMN "folder_id" text REFERENCES "document_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE`);
  },

  down: async ({ db }) => {
    // SQLite doesn't support DROP COLUMN in older versions, but libsql does
    await db.run(sql`ALTER TABLE "tagging_rules" DROP COLUMN "folder_id"`);
  },
} satisfies Migration;
