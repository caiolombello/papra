import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const documentSourceEmailMigration = {
  name: 'document-source-email',

  up: async ({ db }) => {
    await db.run(sql`ALTER TABLE "documents" ADD COLUMN "source_email" text`);
  },

  down: async ({ db }) => {
    await db.run(sql`ALTER TABLE "documents" DROP COLUMN "source_email"`);
  },
} satisfies Migration;
