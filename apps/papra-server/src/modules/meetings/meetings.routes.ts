import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { API_KEY_PERMISSIONS } from '../api-keys/api-keys.constants';
import { getUser } from '../app/auth/auth.models';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { organizationIdSchema } from '../organizations/organization.schemas';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { createError } from '../shared/errors/errors';
import { validateJsonBody, validateParams, validateQuery } from '../shared/validation/validation';
import { createMeetingsRepository } from './meetings.repository';
import { createMeetingBodySchema, ingestMeetingBodySchema, meetingIdSchema, updateMeetingBodySchema } from './meetings.schemas';

export function registerMeetingsRoutes(context: RouteDefinitionContext) {
  setupIngestMeetingRoute(context);
  setupCreateMeetingRoute(context);
  setupListMeetingsRoute(context);
  setupSearchMeetingsRoute(context);
  setupGetMeetingRoute(context);
  setupUpdateMeetingRoute(context);
  setupDeleteMeetingRoute(context);
}

function setupIngestMeetingRoute({ app, db }: RouteDefinitionContext) {
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

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const result = await meetingsRepository.upsertMeetingFromIngestion({
        organizationId,
        createdBy: userId,
        meeting,
      });

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

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { meetings, meetingsCount } = await meetingsRepository.listOrganizationMeetings({
        organizationId,
        pageIndex,
        pageSize,
      });

      return context.json({ meetings, meetingsCount });
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

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { meeting } = await meetingsRepository.getMeetingById({ organizationId, meetingId });

      if (!meeting) {
        throw createError({
          message: 'Meeting not found',
          code: 'meetings.not-found',
          statusCode: 404,
        });
      }

      const { chunks } = await meetingsRepository.getMeetingChunks({ meetingId });

      return context.json({
        meeting: {
          ...meeting,
          chunks,
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

function setupDeleteMeetingRoute({ app, db }: RouteDefinitionContext) {
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

      await meetingsRepository.deleteMeeting({ organizationId, meetingId });

      return context.body(null, 204);
    },
  );
}
