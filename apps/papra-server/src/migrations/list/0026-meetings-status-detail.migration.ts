import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const meetingsStatusDetailMigration = {
  name: 'meetings-status-detail',

  up: async ({ db }) => {
    await db.run(sql`ALTER TABLE "meetings" ADD COLUMN "status_detail" text`);
  },

  down: async ({ db }) => {
    await db.run(sql`ALTER TABLE "meetings" DROP COLUMN "status_detail"`);
  },
} satisfies Migration;
