import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const meetingsAudioDurationMigration = {
  name: 'meetings-audio-duration',

  up: async ({ db }) => {
    await db.run(sql`ALTER TABLE "meetings" ADD COLUMN "audio_duration_seconds" real`);
  },

  down: async ({ db }) => {
    await db.run(sql`ALTER TABLE "meetings" DROP COLUMN "audio_duration_seconds"`);
  },
} satisfies Migration;
