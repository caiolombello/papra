import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { organizationIdSchema } from '../organizations/organization.schemas';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { createError } from '../shared/errors/errors';
import { validateJsonBody, validateParams, validateQuery } from '../shared/validation/validation';
import { DOCUMENT_FOLDER_ID_REGEX } from './document-folders.constants';
import { createDocumentFoldersRepository } from './document-folders.repository';

const folderIdSchema = z.string().regex(DOCUMENT_FOLDER_ID_REGEX);

export function registerDocumentFoldersRoutes(context: RouteDefinitionContext) {
  setupListFoldersRoute(context);
  setupGetFolderRoute(context);
  setupCreateFolderRoute(context);
  setupRenameFolderRoute(context);
  setupDeleteFolderRoute(context);
}

function setupListFoldersRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/folders',
    requireAuthentication(),
    validateParams(z.object({ organizationId: organizationIdSchema })),
    validateQuery(z.object({
      parentId: z.string().optional(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { parentId } = context.req.valid('query');

      const organizationsRepository = createOrganizationsRepository({ db });
      const foldersRepository = createDocumentFoldersRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { folders } = await foldersRepository.listFolders({
        organizationId,
        parentId: parentId ?? null,
      });

      return context.json({ folders });
    },
  );
}

function setupGetFolderRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/folders/:folderId',
    requireAuthentication(),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      folderId: folderIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, folderId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      const foldersRepository = createDocumentFoldersRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { folder } = await foldersRepository.getFolderById({ folderId, organizationId });

      if (!folder) {
        throw createError({ message: 'Folder not found', code: 'folders.not-found', statusCode: 404 });
      }

      const { path } = await foldersRepository.getFolderPath({ folderId, organizationId });

      return context.json({ folder, path });
    },
  );
}

function setupCreateFolderRoute({ app, db }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/folders',
    requireAuthentication(),
    validateParams(z.object({ organizationId: organizationIdSchema })),
    validateJsonBody(z.object({
      name: z.string().trim().min(1).max(256),
      parentId: z.string().nullable().optional().default(null),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { name, parentId } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      const foldersRepository = createDocumentFoldersRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      if (parentId) {
        const { folder: parent } = await foldersRepository.getFolderById({ folderId: parentId, organizationId });
        if (!parent) {
          throw createError({ message: 'Parent folder not found', code: 'folders.parent-not-found', statusCode: 404 });
        }
      }

      const { folder } = await foldersRepository.createFolder({ organizationId, name, parentId });

      return context.json({ folder }, 201);
    },
  );
}

function setupRenameFolderRoute({ app, db }: RouteDefinitionContext) {
  app.patch(
    '/api/organizations/:organizationId/folders/:folderId',
    requireAuthentication(),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      folderId: folderIdSchema,
    })),
    validateJsonBody(z.object({
      name: z.string().trim().min(1).max(256),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, folderId } = context.req.valid('param');
      const { name } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      const foldersRepository = createDocumentFoldersRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { folder } = await foldersRepository.renameFolder({ folderId, organizationId, name });

      if (!folder) {
        throw createError({ message: 'Folder not found', code: 'folders.not-found', statusCode: 404 });
      }

      return context.json({ folder });
    },
  );
}

function setupDeleteFolderRoute({ app, db }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/folders/:folderId',
    requireAuthentication(),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      folderId: folderIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, folderId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      const foldersRepository = createDocumentFoldersRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { folder } = await foldersRepository.getFolderById({ folderId, organizationId });

      if (!folder) {
        throw createError({ message: 'Folder not found', code: 'folders.not-found', statusCode: 404 });
      }

      await foldersRepository.deleteFolder({ folderId, organizationId });

      return context.body(null, 204);
    },
  );
}
