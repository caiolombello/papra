import type { RouteDefinitionContext } from '../../app/server.types';
import { safely } from '@corentinth/chisels';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { API_KEY_PERMISSIONS } from '../../api-keys/api-keys.constants';
import { requireAuthentication } from '../../app/auth/auth.middleware';
import { getUser } from '../../app/auth/auth.models';
import { createOrganizationsRepository } from '../../organizations/organizations.repository';
import { organizationIdSchema } from '../../organizations/organization.schemas';
import { ensureUserIsInOrganization } from '../../organizations/organizations.usecases';
import { createError } from '../../shared/errors/errors';
import { createLogger } from '../../shared/logger/logger';
import { validateJsonBody, validateParams } from '../../shared/validation/validation';
import { createMeetingsRepository } from '../meetings.repository';
import { meetingIdSchema } from '../meetings.schemas';
import { createMeetingTranslationsRepository } from './meeting-translations.repository';
import { meetingTranslationsTable, meetingTranslationChunksTable } from './meeting-translations.tables';

const logger = createLogger({ namespace: 'meeting-translations.routes' });

const TRANSLATION_TARGETS: Record<string, string[]> = {
  'en': ['pt-BR'],
  'pt': ['en'],
  'pt-BR': ['en'],
  'es': ['en', 'pt-BR'],
  'fr': ['en', 'pt-BR'],
  'de': ['en', 'pt-BR'],
};

const LANGUAGE_LABELS: Record<string, string> = {
  'en': 'English',
  'pt-BR': 'Português (BR)',
  'pt': 'Português',
  'es': 'Español',
  'fr': 'Français',
  'de': 'Deutsch',
};

export function registerMeetingTranslationsRoutes(context: RouteDefinitionContext) {
  setupGetAvailableLanguagesRoute(context);
  setupTranslateMeetingRoute(context);
  setupListTranslationsRoute(context);
  setupGetTranslationRoute(context);
  setupDeleteTranslationRoute(context);
}

function setupGetAvailableLanguagesRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/meetings/:meetingId/translations/available',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.READ] }),
    validateParams(z.object({ organizationId: organizationIdSchema, meetingId: meetingIdSchema })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, meetingId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      const meetingsRepository = createMeetingsRepository({ db });
      const translationsRepository = createMeetingTranslationsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { meeting } = await meetingsRepository.getMeetingById({ organizationId, meetingId });
      if (!meeting) throw createError({ message: 'Meeting not found', code: 'meetings.not-found', statusCode: 404 });

      const lang = meeting.language ?? 'en';
      const targets = TRANSLATION_TARGETS[lang] ?? TRANSLATION_TARGETS.en ?? [];

      const { translations: existing } = await translationsRepository.getTranslationsByMeetingId({ meetingId });
      const existingMap = new Map(existing.map(t => [t.targetLanguage, t.status]));

      const available = targets.map(target => ({
        targetLanguage: target,
        label: LANGUAGE_LABELS[target] ?? target,
        status: existingMap.get(target) ?? null,
      }));

      return context.json({ sourceLanguage: lang, available });
    },
  );
}

function setupTranslateMeetingRoute({ app, db, config }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/meetings/:meetingId/translate',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.UPDATE] }),
    validateParams(z.object({ organizationId: organizationIdSchema, meetingId: meetingIdSchema })),
    validateJsonBody(z.object({
      targetLanguage: z.string().min(2).max(10),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, meetingId } = context.req.valid('param');
      const { targetLanguage } = context.req.valid('json');

      const openaiApiKey = config.autofill.openaiApiKey;
      if (!openaiApiKey) throw createError({ message: 'Translation not configured (missing OpenAI API key)', code: 'translations.not-configured', statusCode: 503 });

      const organizationsRepository = createOrganizationsRepository({ db });
      const meetingsRepository = createMeetingsRepository({ db });
      const translationsRepository = createMeetingTranslationsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { meeting } = await meetingsRepository.getMeetingById({ organizationId, meetingId });
      if (!meeting) throw createError({ message: 'Meeting not found', code: 'meetings.not-found', statusCode: 404 });

      // If already processing, reject
      const { translation: existing } = await translationsRepository.getTranslationByMeetingAndTarget({ meetingId, targetLanguage });
      if (existing?.status === 'processing') {
        throw createError({ message: 'Translation is already in progress', code: 'translations.in-progress', statusCode: 409 });
      }

      // If completed or failed, delete and re-create (allows regeneration)
      if (existing) {
        await db.delete(meetingTranslationChunksTable).where(eq(meetingTranslationChunksTable.translationId, existing.id));
        await db.delete(meetingTranslationsTable).where(eq(meetingTranslationsTable.id, existing.id));
      }

      const sourceLanguage = meeting.language ?? 'en';
      const { chunks } = await meetingsRepository.getMeetingChunks({ meetingId });

      if (chunks.length === 0) {
        throw createError({ message: 'Meeting has no transcript to translate', code: 'translations.no-transcript', statusCode: 400 });
      }

      const { translation } = await translationsRepository.createTranslation({
        meetingId,
        organizationId,
        sourceLanguage,
        targetLanguage,
      });

      const translationId = translation!.id;

      // Process translation async
      setImmediate(async () => {
        const [, error] = await safely(async () => {
          const translatedChunks = await translateChunks({
            chunks,
            sourceLanguage,
            targetLanguage,
            openaiApiKey,
            model: config.autofill.model,
          });

          if (translatedChunks.length === 0) {
            throw new Error('Translation produced 0 chunks — LLM response may have been malformed');
          }

          await translationsRepository.insertTranslationChunks({ translationId, chunks: translatedChunks });
          await translationsRepository.updateTranslationStatus({ translationId, status: 'completed' });
          logger.info({ translationId, meetingId, targetLanguage, inputChunks: chunks.length, outputChunks: translatedChunks.length }, 'Translation completed');
        });

        if (error) {
          logger.error({ error, translationId, meetingId }, 'Translation failed');
          await translationsRepository.updateTranslationStatus({ translationId, status: 'failed' });
        }
      });

      return context.json({ translation: { id: translationId, status: 'processing', targetLanguage } }, 202);
    },
  );
}

async function translateChunks({ chunks, sourceLanguage, targetLanguage, openaiApiKey, model }: {
  chunks: { chunkIndex: number; speaker: string | null; content: string }[];
  sourceLanguage: string;
  targetLanguage: string;
  openaiApiKey: string;
  model: string;
}) {
  const BATCH_SIZE = 20;
  const allTranslated: { chunkIndex: number; speaker: string | null; content: string }[] = [];

  const sourceName = LANGUAGE_LABELS[sourceLanguage] ?? sourceLanguage;
  const targetName = LANGUAGE_LABELS[targetLanguage] ?? targetLanguage;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    const inputJson = batch.map(c => ({
      index: c.chunkIndex,
      speaker: c.speaker,
      content: c.content,
    }));

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: `Translate the following transcript chunks from ${sourceName} to ${targetName}.

IMPORTANT: Return a JSON object with a "chunks" key containing an array.
Each element must have: "index" (number, same as input), "speaker" (string or null, keep original), "content" (translated string).
Translate ALL chunks. Do not skip any. Do not add new ones.

Input (${batch.length} chunks):
${JSON.stringify(inputJson)}`,
        }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = await response.json() as { choices: { message: { content: string } }[] };
    const rawContent = data.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(rawContent) as any;

    // Extract array from various possible response shapes
    const translated: any[] = parsed.chunks ?? parsed.translations ?? parsed.result ?? parsed.data
      ?? (Array.isArray(parsed) ? parsed : []);

    if (translated.length === 0) {
      logger.warn({ batchStart: i, batchSize: batch.length, rawContent: rawContent.slice(0, 300) }, 'LLM returned 0 translated chunks for batch');
    }

    for (const item of translated) {
      if (item && typeof item.content === 'string') {
        allTranslated.push({
          chunkIndex: typeof item.index === 'number' ? item.index : batch[0].chunkIndex + allTranslated.length,
          speaker: item.speaker ?? null,
          content: item.content,
        });
      }
    }
  }

  return allTranslated;
}

function setupDeleteTranslationRoute({ app, db }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/meetings/:meetingId/translations/:translationId',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.UPDATE] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      meetingId: meetingIdSchema,
      translationId: z.string(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, translationId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      await db.delete(meetingTranslationChunksTable).where(eq(meetingTranslationChunksTable.translationId, translationId));
      await db.delete(meetingTranslationsTable).where(eq(meetingTranslationsTable.id, translationId));

      return context.body(null, 204);
    },
  );
}

function setupListTranslationsRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/meetings/:meetingId/translations',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.READ] }),
    validateParams(z.object({ organizationId: organizationIdSchema, meetingId: meetingIdSchema })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, meetingId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const translationsRepository = createMeetingTranslationsRepository({ db });
      const { translations } = await translationsRepository.getTranslationsByMeetingId({ meetingId });

      return context.json({ translations });
    },
  );
}

function setupGetTranslationRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/meetings/:meetingId/translations/:translationId',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.READ] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      meetingId: meetingIdSchema,
      translationId: z.string(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, translationId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const translationsRepository = createMeetingTranslationsRepository({ db });
      const { translation } = await translationsRepository.getTranslationById({ translationId });

      if (!translation) {
        throw createError({ message: 'Translation not found', code: 'translations.not-found', statusCode: 404 });
      }

      const { chunks } = await translationsRepository.getTranslationChunks({ translationId });

      return context.json({ translation: { ...translation, chunks } });
    },
  );
}
