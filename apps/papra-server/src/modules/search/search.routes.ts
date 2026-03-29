import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { API_KEY_PERMISSIONS } from '../api-keys/api-keys.constants';
import { getUser } from '../app/auth/auth.models';
import { searchOrganizationDocuments } from '../documents/document-search/document-search.usecase';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { organizationIdSchema } from '../organizations/organization.schemas';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { validateParams, validateQuery } from '../shared/validation/validation';
import { createMeetingsRepository } from '../meetings/meetings.repository';

const searchScopeSchema = z.enum(['all', 'documents', 'meetings']);

export function registerSearchRoutes({ app, db, documentSearchServices }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/search',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.READ] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    validateQuery(z.object({
      searchQuery: z.string().optional().default(''),
      scope: searchScopeSchema.optional().default('all'),
      pageIndex: z.coerce.number().min(0).int().optional().default(0),
      pageSize: z.coerce.number().min(1).max(100).int().optional().default(20),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { searchQuery, scope, pageIndex, pageSize } = context.req.valid('query');

      const organizationsRepository = createOrganizationsRepository({ db });
      const meetingsRepository = createMeetingsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const shouldSearchDocuments = scope === 'all' || scope === 'documents';
      const shouldSearchMeetings = scope === 'all' || scope === 'meetings';

      const [
        documentResult,
        meetingResult,
      ] = await Promise.all([
        shouldSearchDocuments
          ? searchOrganizationDocuments({ organizationId, searchQuery, pageIndex, pageSize, documentSearchServices })
          : Promise.resolve({ documents: [], documentsCount: 0 }),
        shouldSearchMeetings
          ? meetingsRepository.searchOrganizationMeetings({ organizationId, searchQuery, pageIndex, pageSize })
          : Promise.resolve({ meetings: [], meetingsCount: 0 }),
      ]);

      return context.json({
        scope,
        documents: documentResult.documents,
        documentsCount: documentResult.documentsCount,
        meetings: meetingResult.meetings,
        meetingsCount: meetingResult.meetingsCount,
        totalCount: documentResult.documentsCount + meetingResult.meetingsCount,
      });
    },
  );
}
