import type { RouteDefinitionContext } from '../app/server.types';
import { safely } from '@corentinth/chisels';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { API_KEY_PERMISSIONS } from '../api-keys/api-keys.constants';
import { getUser } from '../app/auth/auth.models';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { organizationIdSchema } from '../organizations/organization.schemas';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { createError } from '../shared/errors/errors';
import { createLogger } from '../shared/logger/logger';
import { validateJsonBody, validateParams, validateQuery } from '../shared/validation/validation';
import { createTagsRepository } from '../tags/tags.repository';
import { normalizeTagName } from '../tags/tags.repository.models';
import { tagIdSchema } from '../tags/tags.schemas';
import { CopyObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { MEETING_STATUSES } from './meetings.constants';
import { deleteMeetingArtifacts } from './meetings-artifacts.storage';
import { createMeetingPlaybackPresignedUrl, isMeetingPlaybackEnabled } from './meetings-playback.storage';
import { createMeetingUploadPresignedUrl, isMeetingUploadEnabled } from './meetings-upload.storage';
import { createMeetingsRepository } from './meetings.repository';
import { createMeetingBodySchema, ingestMeetingBodySchema, meetingIdSchema, updateMeetingBodySchema } from './meetings.schemas';

const logger = createLogger({ namespace: 'meetings.routes' });

export function registerMeetingsRoutes(context: RouteDefinitionContext) {
  setupUploadMeetingRoute(context);
  setupIngestMeetingRoute(context);
  setupCreateMeetingRoute(context);
  setupListMeetingsRoute(context);
  setupSearchMeetingsRoute(context);
  setupMeetingStatsRoute(context);
  setupGetMeetingRoute(context);
  setupUpdateMeetingRoute(context);
  setupDeleteMeetingRoute(context);
  setupMeetingPlaybackRoute(context);
  setupRetranscribeMeetingRoute(context);
  setupDiarizeMeetingRoute(context);
  setupAddTagToMeetingRoute(context);
  setupRemoveTagFromMeetingRoute(context);
}

function setupUploadMeetingRoute({ app, db, config }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/meetings/upload/presign',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.CREATE] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    validateJsonBody(z.object({
      fileName: z.string().trim().min(1).max(256),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { fileName } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const result = await createMeetingUploadPresignedUrl({ config, fileName });

      const meetingsRepository = createMeetingsRepository({ db });
      const { meeting } = await meetingsRepository.createMeeting({
        organizationId,
        createdBy: userId,
        meeting: {
          title: fileName,
          sourceName: fileName,
          sourceStorageKey: result.storageKey,
          chunks: [],
        },
        status: MEETING_STATUSES.UPLOADING,
      });

      return context.json({ ...result, meetingId: meeting.id });
    },
  );
}

function setupIngestMeetingRoute({ app, db, config }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/meetings/ingest',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.CREATE] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    validateJsonBody(ingestMeetingBodySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const meeting = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      const meetingsRepository = createMeetingsRepository({ db });
      const tagsRepository = createTagsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const result = await meetingsRepository.upsertMeetingFromIngestion({
        organizationId,
        createdBy: userId,
        meeting,
      });

      // Auto-tag based on detected context
      if (meeting.context) {
        await safely(autoTagMeeting({
          meetingId: result.meeting.id,
          organizationId,
          context: meeting.context,
          tagsRepository,
          config,
        }));
      }

      return context.json(result);
    },
  );
}

function setupCreateMeetingRoute({ app, db }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/meetings',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.CREATE] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    validateJsonBody(createMeetingBodySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const meeting = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      const meetingsRepository = createMeetingsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { meeting: createdMeeting } = await meetingsRepository.createMeeting({
        organizationId,
        createdBy: userId,
        meeting,
      });

      return context.json({ meeting: createdMeeting });
    },
  );
}

function setupListMeetingsRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/meetings',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.READ] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    validateQuery(z.object({
      pageIndex: z.coerce.number().min(0).int().optional().default(0),
      pageSize: z.coerce.number().min(1).max(100).int().optional().default(100),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { pageIndex, pageSize } = context.req.valid('query');

      const organizationsRepository = createOrganizationsRepository({ db });
      const meetingsRepository = createMeetingsRepository({ db });
      const tagsRepository = createTagsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { meetings, meetingsCount } = await meetingsRepository.listOrganizationMeetings({
        organizationId,
        pageIndex,
        pageSize,
      });

      const { tagsByMeetingId } = await tagsRepository.getTagsByMeetingIds({ meetingIds: meetings.map(m => m.id) });
      const enrichedMeetings = meetings.map(m => ({ ...m, tags: tagsByMeetingId[m.id] ?? [] }));

      return context.json({ meetings: enrichedMeetings, meetingsCount });
    },
  );
}

function setupSearchMeetingsRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/meetings/search',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.READ] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    validateQuery(z.object({
      searchQuery: z.string().trim().min(1),
      pageIndex: z.coerce.number().min(0).int().optional().default(0),
      pageSize: z.coerce.number().min(1).max(100).int().optional().default(100),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { searchQuery, pageIndex, pageSize } = context.req.valid('query');

      const organizationsRepository = createOrganizationsRepository({ db });
      const meetingsRepository = createMeetingsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { meetings, meetingsCount } = await meetingsRepository.searchOrganizationMeetings({
        organizationId,
        searchQuery,
        pageIndex,
        pageSize,
      });

      return context.json({ meetings, totalCount: meetingsCount });
    },
  );
}

function setupGetMeetingRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/meetings/:meetingId',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.READ] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      meetingId: meetingIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, meetingId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      const meetingsRepository = createMeetingsRepository({ db });
      const tagsRepository = createTagsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { meeting } = await meetingsRepository.getMeetingById({ organizationId, meetingId });

      if (!meeting) {
        throw createError({
          message: 'Meeting not found',
          code: 'meetings.not-found',
          statusCode: 404,
        });
      }

      const [{ chunks }, { tagsByMeetingId }] = await Promise.all([
        meetingsRepository.getMeetingChunks({ meetingId }),
        tagsRepository.getTagsByMeetingIds({ meetingIds: [meetingId] }),
      ]);

      return context.json({
        meeting: {
          ...meeting,
          chunks,
          tags: tagsByMeetingId[meetingId] ?? [],
        },
      });
    },
  );
}

function setupUpdateMeetingRoute({ app, db }: RouteDefinitionContext) {
  app.patch(
    '/api/organizations/:organizationId/meetings/:meetingId',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.UPDATE] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      meetingId: meetingIdSchema,
    })),
    validateJsonBody(updateMeetingBodySchema),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, meetingId } = context.req.valid('param');
      const meetingUpdate = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      const meetingsRepository = createMeetingsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { meeting } = await meetingsRepository.updateMeeting({
        organizationId,
        meetingId,
        meeting: meetingUpdate,
      });

      if (!meeting) {
        throw createError({
          message: 'Meeting not found',
          code: 'meetings.not-found',
          statusCode: 404,
        });
      }

      return context.json({ meeting });
    },
  );
}

function setupDeleteMeetingRoute({ app, db, config }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/meetings/:meetingId',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.DELETE] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      meetingId: meetingIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, meetingId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      const meetingsRepository = createMeetingsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { meeting } = await meetingsRepository.getMeetingById({ organizationId, meetingId });

      if (!meeting) {
        throw createError({
          message: 'Meeting not found',
          code: 'meetings.not-found',
          statusCode: 404,
        });
      }

      await deleteMeetingArtifacts({
        config,
        meeting,
      });

      await meetingsRepository.deleteMeeting({ organizationId, meetingId });

      return context.body(null, 204);
    },
  );
}

function setupMeetingPlaybackRoute({ app, db, config }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/meetings/:meetingId/playback-url',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.READ] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      meetingId: meetingIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, meetingId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      const meetingsRepository = createMeetingsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      if (!isMeetingPlaybackEnabled({ config })) {
        throw createError({
          message: 'Meeting audio playback is not configured',
          code: 'meetings.playback-not-configured',
          statusCode: 503,
        });
      }

      const { meeting } = await meetingsRepository.getMeetingById({ organizationId, meetingId });

      if (!meeting) {
        throw createError({
          message: 'Meeting not found',
          code: 'meetings.not-found',
          statusCode: 404,
        });
      }

      if (!meeting.sourceStorageKey) {
        throw createError({
          message: 'Meeting has no audio source',
          code: 'meetings.no-audio-source',
          statusCode: 404,
        });
      }

      const { playbackUrl, expiresInSeconds } = await createMeetingPlaybackPresignedUrl({
        config,
        sourceStorageKey: meeting.sourceStorageKey,
      });

      return context.json({ playbackUrl, expiresInSeconds });
    },
  );
}

function setupRetranscribeMeetingRoute({ app, db, config }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/meetings/:meetingId/retranscribe',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.UPDATE] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      meetingId: meetingIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, meetingId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      const meetingsRepository = createMeetingsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { meeting } = await meetingsRepository.getMeetingById({ organizationId, meetingId });

      if (!meeting) {
        throw createError({
          message: 'Meeting not found',
          code: 'meetings.not-found',
          statusCode: 404,
        });
      }

      if (!meeting.sourceStorageKey) {
        throw createError({
          message: 'Meeting has no audio source to re-transcribe',
          code: 'meetings.no-audio-source',
          statusCode: 400,
        });
      }

      // Re-trigger the transcription pipeline by copying the S3 object in-place
      // This fires the S3 event notification → SQS → worker
      const bucketName = process.env.MEETINGS_SOURCE_STORAGE_BUCKET_NAME;
      if (bucketName) {
        const s3Config = config.documentsStorage.drivers.s3;
        const s3Client = new S3Client({
          region: s3Config.region,
          endpoint: s3Config.endpoint,
          forcePathStyle: s3Config.forcePathStyle,
          credentials: {
            accessKeyId: s3Config.accessKeyId,
            secretAccessKey: s3Config.secretAccessKey,
          },
        });

        await s3Client.send(new CopyObjectCommand({
          Bucket: bucketName,
          CopySource: `${bucketName}/${meeting.sourceStorageKey}`,
          Key: meeting.sourceStorageKey,
          MetadataDirective: 'REPLACE',
          Metadata: { retranscribe: 'true', meetingId },
        }));

        // Only set processing after successful S3 copy
        await meetingsRepository.updateMeetingStatus({ meetingId, organizationId, status: MEETING_STATUSES.PROCESSING });
      }

      return context.json({ message: 'Re-transcription scheduled', meetingId }, 202);
    },
  );
}

function setupDiarizeMeetingRoute({ app, db, config }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/meetings/:meetingId/diarize',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.UPDATE] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      meetingId: meetingIdSchema,
    })),
    validateJsonBody(z.object({
      speakersExpected: z.number().int().min(2).max(10).optional(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, meetingId } = context.req.valid('param');
      const { speakersExpected } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      const meetingsRepository = createMeetingsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { meeting } = await meetingsRepository.getMeetingById({ organizationId, meetingId });

      if (!meeting) {
        throw createError({ message: 'Meeting not found', code: 'meetings.not-found', statusCode: 404 });
      }

      if (!meeting.sourceStorageKey) {
        throw createError({ message: 'Meeting has no audio source', code: 'meetings.no-audio-source', statusCode: 400 });
      }

      // Copy S3 object with diarize=true metadata to trigger worker with diarization
      const bucketName = process.env.MEETINGS_SOURCE_STORAGE_BUCKET_NAME;
      if (bucketName) {
        const s3Config = config.documentsStorage.drivers.s3;
        const s3Client = new S3Client({
          region: s3Config.region,
          endpoint: s3Config.endpoint,
          forcePathStyle: s3Config.forcePathStyle,
          credentials: {
            accessKeyId: s3Config.accessKeyId,
            secretAccessKey: s3Config.secretAccessKey,
          },
        });

        await s3Client.send(new CopyObjectCommand({
          Bucket: bucketName,
          CopySource: `${bucketName}/${meeting.sourceStorageKey}`,
          Key: meeting.sourceStorageKey,
          MetadataDirective: 'REPLACE',
          Metadata: {
            diarize: 'true',
            meetingId,
            ...(speakersExpected ? { 'speakers-expected': String(speakersExpected) } : {}),
          },
        }));

        await meetingsRepository.updateMeetingStatus({ meetingId, organizationId, status: MEETING_STATUSES.PROCESSING });
        await meetingsRepository.updateMeeting({
          meetingId,
          organizationId,
          meeting: { statusDetail: 'Queued for speaker identification...' },
        });
      }

      return context.json({ message: 'Speaker identification scheduled', meetingId }, 202);
    },
  );
}

function setupMeetingStatsRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/meetings/stats',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.READ] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      const meetingsRepository = createMeetingsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { stats } = await meetingsRepository.getMeetingStats({ organizationId });

      return context.json({ stats });
    },
  );
}

const CONTEXT_TAG_COLORS: Record<string, string> = {
  financeiro: '#22c55e',
  tecnologia: '#3b82f6',
  juridico: '#f59e0b',
  geral: '#6b7280',
};

async function autoTagMeeting({
  meetingId,
  organizationId,
  context,
  tagsRepository,
  config,
}: {
  meetingId: string;
  organizationId: string;
  context: string;
  tagsRepository: ReturnType<typeof createTagsRepository>;
  config: any;
}) {
  const normalized = normalizeTagName({ name: context });
  let { tag } = await tagsRepository.getTagByNormalizedName({ organizationId, normalizedName: normalized });

  if (!tag) {
    const color = CONTEXT_TAG_COLORS[context.toLowerCase()] ?? '#6b7280';
    const [result] = await safely(tagsRepository.createTag({ tag: { organizationId, name: context, color } }));
    tag = result?.tag;
  }

  if (tag) {
    await safely(tagsRepository.addTagToMeeting({ tagId: tag.id, meetingId }));
  }
}

function setupAddTagToMeetingRoute({ app, db }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/meetings/:meetingId/tags',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.UPDATE] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      meetingId: meetingIdSchema,
    })),
    validateJsonBody(z.object({
      tagId: tagIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, meetingId } = context.req.valid('param');
      const { tagId } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      const meetingsRepository = createMeetingsRepository({ db });
      const tagsRepository = createTagsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { meeting } = await meetingsRepository.getMeetingById({ organizationId, meetingId });

      if (!meeting) {
        throw createError({
          message: 'Meeting not found',
          code: 'meetings.not-found',
          statusCode: 404,
        });
      }

      const { tag } = await tagsRepository.getTagById({ tagId, organizationId });

      if (!tag) {
        throw createError({
          message: 'Tag not found',
          code: 'tags.not-found',
          statusCode: 404,
        });
      }

      await tagsRepository.addTagToMeeting({ tagId, meetingId });

      return context.json({ meetingId, tagId }, 201);
    },
  );
}

function setupRemoveTagFromMeetingRoute({ app, db }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/meetings/:meetingId/tags/:tagId',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.UPDATE] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      meetingId: meetingIdSchema,
      tagId: tagIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, meetingId, tagId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      const meetingsRepository = createMeetingsRepository({ db });
      const tagsRepository = createTagsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { meeting } = await meetingsRepository.getMeetingById({ organizationId, meetingId });

      if (!meeting) {
        throw createError({
          message: 'Meeting not found',
          code: 'meetings.not-found',
          statusCode: 404,
        });
      }

      await tagsRepository.removeTagFromMeeting({ tagId, meetingId });

      return context.body(null, 204);
    },
  );
}
