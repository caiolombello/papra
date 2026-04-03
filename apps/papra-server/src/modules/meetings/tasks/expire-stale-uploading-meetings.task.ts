import type { Database } from '../../app/database/database.types';
import type { TaskServices } from '../../tasks/tasks.services';
import { eq, and, lt } from 'drizzle-orm';
import { createLogger } from '../../shared/logger/logger';

const logger = createLogger({ namespace: 'meetings:tasks:expireStaleUploading' });

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export async function registerExpireStaleUploadingMeetingsTask({ taskServices, db }: { taskServices: TaskServices; db: Database }) {
  const taskName = 'expire-stale-uploading-meetings';

  taskServices.registerTask({
    taskName,
    handler: async () => {
      const { meetingsTable } = await import('../meetings.tables');

      const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

      const stale = await db.select({ id: meetingsTable.id, title: meetingsTable.title })
        .from(meetingsTable)
        .where(and(
          eq(meetingsTable.status, 'uploading'),
          lt(meetingsTable.createdAt, cutoff),
        ));

      if (stale.length === 0) {
        return;
      }

      for (const meeting of stale) {
        await db.update(meetingsTable)
          .set({ status: 'failed', statusDetail: 'Upload timed out after 30 minutes' })
          .where(eq(meetingsTable.id, meeting.id));
      }

      logger.info({ count: stale.length, ids: stale.map(m => m.id) }, 'Expired stale uploading meetings');
    },
  });

  await taskServices.schedulePeriodicJob({
    scheduleId: `periodic-${taskName}`,
    taskName,
    cron: '*/10 * * * *', // Every 10 minutes
    immediate: true,
  });

  logger.info('Stale uploading meetings cleanup task registered');
}
