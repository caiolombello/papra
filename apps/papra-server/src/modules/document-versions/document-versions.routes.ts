import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { organizationIdSchema } from '../organizations/organization.schemas';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { validateParams } from '../shared/validation/validation';
import { documentIdSchema } from '../documents/documents.schemas';
import { createDocumentVersionsRepository } from './document-versions.repository';

export function registerDocumentVersionsRoutes(context: RouteDefinitionContext) {
  setupGetDocumentVersionsRoute(context);
}

function setupGetDocumentVersionsRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/documents/:documentId/versions',
    requireAuthentication(),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      documentId: documentIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, documentId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      const documentVersionsRepository = createDocumentVersionsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { versions } = await documentVersionsRepository.getDocumentVersions({ documentId });

      return context.json({ versions });
    },
  );
}
