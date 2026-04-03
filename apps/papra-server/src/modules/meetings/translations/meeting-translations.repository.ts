import type { Database } from '../../app/database/database.types';
import { injectArguments } from '@corentinth/chisels';
import { and, eq } from 'drizzle-orm';
import { meetingTranslationsTable, meetingTranslationChunksTable } from './meeting-translations.tables';

export type MeetingTranslationsRepository = ReturnType<typeof createMeetingTranslationsRepository>;

export function createMeetingTranslationsRepository({ db }: { db: Database }) {
  return injectArguments({
    createTranslation,
    getTranslationsByMeetingId,
    getTranslationById,
    getTranslationChunks,
    updateTranslationStatus,
    insertTranslationChunks,
    getTranslationByMeetingAndTarget,
  }, { db });
}

async function createTranslation({ meetingId, organizationId, sourceLanguage, targetLanguage, db }: {
  meetingId: string;
  organizationId: string;
  sourceLanguage: string;
  targetLanguage: string;
  db: Database;
}) {
  const [translation] = await db.insert(meetingTranslationsTable).values({
    meetingId,
    organizationId,
    sourceLanguage,
    targetLanguage,
    status: 'processing',
  }).returning();

  return { translation };
}

async function getTranslationsByMeetingId({ meetingId, db }: { meetingId: string; db: Database }) {
  const translations = await db.select().from(meetingTranslationsTable)
    .where(eq(meetingTranslationsTable.meetingId, meetingId));

  return { translations };
}

async function getTranslationById({ translationId, db }: { translationId: string; db: Database }) {
  const [translation] = await db.select().from(meetingTranslationsTable)
    .where(eq(meetingTranslationsTable.id, translationId));

  return { translation: translation ?? null };
}

async function getTranslationByMeetingAndTarget({ meetingId, targetLanguage, db }: {
  meetingId: string;
  targetLanguage: string;
  db: Database;
}) {
  const [translation] = await db.select().from(meetingTranslationsTable)
    .where(and(
      eq(meetingTranslationsTable.meetingId, meetingId),
      eq(meetingTranslationsTable.targetLanguage, targetLanguage),
    ));

  return { translation: translation ?? null };
}

async function getTranslationChunks({ translationId, db }: { translationId: string; db: Database }) {
  const chunks = await db.select().from(meetingTranslationChunksTable)
    .where(eq(meetingTranslationChunksTable.translationId, translationId))
    .orderBy(meetingTranslationChunksTable.chunkIndex);

  return { chunks };
}

async function updateTranslationStatus({ translationId, status, db }: {
  translationId: string;
  status: string;
  db: Database;
}) {
  await db.update(meetingTranslationsTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(meetingTranslationsTable.id, translationId));
}

async function insertTranslationChunks({ translationId, chunks, db }: {
  translationId: string;
  chunks: { chunkIndex: number; speaker: string | null; content: string }[];
  db: Database;
}) {
  if (chunks.length === 0) return;

  await db.insert(meetingTranslationChunksTable).values(
    chunks.map(c => ({
      translationId,
      chunkIndex: c.chunkIndex,
      speaker: c.speaker,
      content: c.content,
    })),
  );
}
