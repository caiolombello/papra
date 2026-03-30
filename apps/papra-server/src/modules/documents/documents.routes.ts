import type { RouteDefinitionContext } from '../app/server.types';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { createCustomPropertiesRepository } from '../custom-properties/custom-properties.repository';
import { organizationIdSchema } from '../organizations/organization.schemas';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { createPlansRepository } from '../plans/plans.repository';
import { getOrganizationPlan } from '../plans/plans.usecases';
import { getFileStreamFromMultipartForm } from '../shared/streams/file-upload';
import { validateJsonBody, validateParams, validateQuery } from '../shared/validation/validation';
import { createSubscriptionsRepository } from '../subscriptions/subscriptions.repository';
import { createDocumentVersionsRepository } from '../document-versions/document-versions.repository';
import { createTagsRepository } from '../tags/tags.repository';
import { searchOrganizationDocuments } from './document-search/document-search.usecase';
import { createDocumentIsNotDeletedError } from './documents.errors';
import { formatDocumentForApi, formatDocumentsForApi, isDocumentSizeLimitEnabled } from './documents.models';
import { createDocumentsRepository } from './documents.repository';
import { documentIdSchema } from './documents.schemas';
import { getOrCreateThumbnail } from './document-thumbnail.service';
import { createDocumentCreationUsecase, deleteAllTrashDocuments, deleteTrashDocument, enrichAndFormatDocumentForApi, enrichAndFormatDocumentsForApi, ensureDocumentExists, getDocumentOrThrow, restoreDocument, trashDocument, updateDocument } from './documents.usecases';

export function registerDocumentsRoutes(context: RouteDefinitionContext) {
  setupCreateDocumentRoute(context);
  setupGetDocumentsRoute(context);
  setupRestoreDocumentRoute(context);
  setupGetDeletedDocumentsRoute(context);
  setupGetOrganizationDocumentsStatsRoute(context);
  setupGetDocumentRoute(context);
  setupDeleteTrashDocumentRoute(context);
  setupDeleteAllTrashDocumentsRoute(context);
  setupDeleteDocumentRoute(context);
  setupGetDocumentFileRoute(context);
  setupUpdateDocumentRoute(context);
  setupReplaceDocumentFileRoute(context);
  setupGetDocumentThumbnailRoute(context);
}

function setupCreateDocumentRoute({ app, ...deps }: RouteDefinitionContext) {
  const { config, db } = deps;

  app.post(
    '/api/organizations/:organizationId/documents',
    requireAuthentication({ apiKeyPermissions: ['documents:create'] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      // Get organization's plan-specific upload limit
      const plansRepository = createPlansRepository({ config });
      const subscriptionsRepository = createSubscriptionsRepository({ db });

      const { organizationPlan } = await getOrganizationPlan({ organizationId, plansRepository, subscriptionsRepository });
      const { maxFileSize } = organizationPlan.limits;

      const { fileStream, fileName, mimeType } = await getFileStreamFromMultipartForm({
        body: context.req.raw.body,
        headers: context.req.header(),
        maxFileSize: isDocumentSizeLimitEnabled({ maxUploadSize: maxFileSize }) ? maxFileSize : undefined,
      });

      const createDocument = createDocumentCreationUsecase({ ...deps });

      const { document } = await createDocument({ fileStream, fileName, mimeType, userId, organizationId });

      return context.json({ document: formatDocumentForApi({ document }) });
    },
  );
}

function setupGetDeletedDocumentsRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/documents/deleted',
    requireAuthentication({ apiKeyPermissions: ['documents:read'] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    validateQuery(
      z.object({
        pageIndex: z.coerce.number().min(0).int().optional().default(0),
        pageSize: z.coerce.number().min(1).max(100).int().optional().default(100),
      }),
    ),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId } = context.req.valid('param');
      const { pageIndex, pageSize } = context.req.valid('query');

      const documentsRepository = createDocumentsRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const [
        { documents },
        { documentsCount },
      ] = await Promise.all([
        documentsRepository.getOrganizationDeletedDocuments({ organizationId, pageIndex, pageSize }),
        documentsRepository.getOrganizationDeletedDocumentsCount({ organizationId }),
      ]);

      return context.json({
        documents: formatDocumentsForApi({ documents }),
        documentsCount,
      });
    },
  );
}

function setupGetDocumentRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/documents/:documentId',
    requireAuthentication({ apiKeyPermissions: ['documents:read'] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      documentId: documentIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId, documentId } = context.req.valid('param');

      const documentsRepository = createDocumentsRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });
      const customPropertiesRepository = createCustomPropertiesRepository({ db });
      const tagsRepository = createTagsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { document } = await getDocumentOrThrow({ documentId, organizationId, documentsRepository });
      const { enrichedDocument } = await enrichAndFormatDocumentForApi({ document, tagsRepository, customPropertiesRepository });

      return context.json({ document: enrichedDocument });
    },
  );
}

function setupDeleteDocumentRoute({ app, db, eventServices }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/documents/:documentId',
    requireAuthentication({ apiKeyPermissions: ['documents:delete'] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      documentId: documentIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId, documentId } = context.req.valid('param');

      const documentsRepository = createDocumentsRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });
      await ensureDocumentExists({ documentId, organizationId, documentsRepository });

      await trashDocument({
        documentId,
        organizationId,
        userId,
        documentsRepository,
        eventServices,
      });

      return context.json({
        success: true,
      });
    },
  );
}

function setupRestoreDocumentRoute({ app, db, eventServices }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/documents/:documentId/restore',
    requireAuthentication(),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      documentId: documentIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId, documentId } = context.req.valid('param');

      const documentsRepository = createDocumentsRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { document } = await getDocumentOrThrow({ documentId, organizationId, documentsRepository });

      if (!document.isDeleted) {
        throw createDocumentIsNotDeletedError();
      }

      await restoreDocument({
        documentId,
        organizationId,
        userId,
        documentsRepository,
        eventServices,
      });

      return context.body(null, 204);
    },
  );
}

function setupGetDocumentFileRoute({ app, db, documentsStorageService }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/documents/:documentId/file',
    requireAuthentication({ apiKeyPermissions: ['documents:read'] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      documentId: documentIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId, documentId } = context.req.valid('param');

      const documentsRepository = createDocumentsRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { document } = await getDocumentOrThrow({ documentId, documentsRepository, organizationId });

      const { fileStream } = await documentsStorageService.getFileStream({
        storageKey: document.originalStorageKey,
        fileEncryptionAlgorithm: document.fileEncryptionAlgorithm,
        fileEncryptionKekVersion: document.fileEncryptionKekVersion,
        fileEncryptionKeyWrapped: document.fileEncryptionKeyWrapped,
      });

      return context.body(
        Readable.toWeb(fileStream),
        200,
        {
          // Prevent XSS by serving the file as an octet-stream
          'Content-Type': 'application/octet-stream',
          // Always use attachment for defense in depth - client uses blob API anyway
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`,
          'Content-Length': String(document.originalSize),
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
        },
      );
    },
  );
}

function setupGetDocumentThumbnailRoute({ app, db, documentsStorageService }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/documents/:documentId/thumbnail',
    requireAuthentication({ apiKeyPermissions: ['documents:read'] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      documentId: documentIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, documentId } = context.req.valid('param');

      const documentsRepository = createDocumentsRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { document } = await getDocumentOrThrow({ documentId, documentsRepository, organizationId });

      const result = await getOrCreateThumbnail({
        storageKey: document.originalStorageKey,
        mimeType: document.mimeType,
        documentsStorageService,
        fileEncryptionAlgorithm: document.fileEncryptionAlgorithm,
        fileEncryptionKekVersion: document.fileEncryptionKekVersion,
        fileEncryptionKeyWrapped: document.fileEncryptionKeyWrapped,
      });

      if (!result) {
        return context.body(null, 404);
      }

      return context.body(
        Readable.toWeb(result.thumbnailStream),
        200,
        {
          'Content-Type': result.contentType,
          'Cache-Control': 'private, max-age=86400',
        },
      );
    },
  );
}

function setupGetDocumentsRoute({ app, db, documentSearchServices }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/documents',
    requireAuthentication({ apiKeyPermissions: ['documents:read'] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    validateQuery(
      z.object({
        searchQuery: z.string().optional().default(''),
        folderId: z.string().optional(),
        pageIndex: z.coerce.number().min(0).int().optional().default(0),
        pageSize: z.coerce.number().min(1).max(100).int().optional().default(100),
      }),
    ),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId } = context.req.valid('param');
      const { searchQuery, folderId, pageIndex, pageSize } = context.req.valid('query');

      const organizationsRepository = createOrganizationsRepository({ db });
      const documentsRepository = createDocumentsRepository({ db });
      const customPropertiesRepository = createCustomPropertiesRepository({ db });
      const tagsRepository = createTagsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      let documents;
      let documentsCount;

      if (folderId && !searchQuery) {
        const result = await documentsRepository.getDocumentsByFolderId({
          organizationId,
          folderId: folderId === 'root' ? null : folderId,
          pageIndex,
          pageSize,
        });
        documents = result.documents;
        documentsCount = result.documentsCount;
      } else {
        const result = await searchOrganizationDocuments({ organizationId, searchQuery, pageIndex, pageSize, documentSearchServices });
        documents = result.documents;
        documentsCount = result.documentsCount;
      }

      const { enrichedDocuments } = await enrichAndFormatDocumentsForApi({ documents, tagsRepository, customPropertiesRepository });

      return context.json({ documents: enrichedDocuments, documentsCount });
    },
  );
}

function setupGetOrganizationDocumentsStatsRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/documents/statistics',
    requireAuthentication({ apiKeyPermissions: ['documents:read'] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      const documentsRepository = createDocumentsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const {
        documentsCount,
        documentsSize,
        deletedDocumentsCount,
        deletedDocumentsSize,
        totalDocumentsCount,
        totalDocumentsSize,
      } = await documentsRepository.getOrganizationStats({ organizationId });

      return context.json({
        organizationStats: {
          documentsCount,
          documentsSize,
          deletedDocumentsCount,
          deletedDocumentsSize,
          totalDocumentsCount,
          totalDocumentsSize,
        },
      });
    },
  );
}

function setupDeleteTrashDocumentRoute({ app, db, documentsStorageService, eventServices }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/documents/trash/:documentId',
    requireAuthentication(),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      documentId: documentIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId, documentId } = context.req.valid('param');

      const documentsRepository = createDocumentsRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      await deleteTrashDocument({ documentId, organizationId, documentsRepository, documentsStorageService, eventServices });

      return context.json({
        success: true,
      });
    },
  );
}

function setupDeleteAllTrashDocumentsRoute({ app, db, documentsStorageService, eventServices }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/documents/trash',
    requireAuthentication(),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId } = context.req.valid('param');

      const documentsRepository = createDocumentsRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      await deleteAllTrashDocuments({ organizationId, documentsRepository, documentsStorageService, eventServices });

      return context.body(null, 204);
    },
  );
}

function setupUpdateDocumentRoute({ app, db, eventServices }: RouteDefinitionContext) {
  app.patch(
    '/api/organizations/:organizationId/documents/:documentId',
    requireAuthentication({ apiKeyPermissions: ['documents:update'] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      documentId: documentIdSchema,
    })),
    validateJsonBody(z.object({
      name: z.string().min(1).max(255).optional(),
      content: z.string().optional(),
      documentDate: z.coerce.date().nullable().optional(),
    }).refine(data => data.name !== undefined || data.content !== undefined || data.documentDate !== undefined, {
      message: 'At least one of \'name\', \'content\', or \'documentDate\' must be provided',
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, documentId } = context.req.valid('param');
      const changes = context.req.valid('json');

      const documentsRepository = createDocumentsRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });
      await ensureDocumentExists({ documentId, organizationId, documentsRepository });

      const { document } = await updateDocument({
        documentId,
        organizationId,
        userId,
        documentsRepository,
        eventServices,
        changes,
      });

      return context.json({ document: formatDocumentForApi({ document }) });
    },
  );
}

function setupReplaceDocumentFileRoute({ app, db, documentsStorageService, taskServices, eventServices, config }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/documents/:documentId/replace',
    requireAuthentication({ apiKeyPermissions: ['documents:update'] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      documentId: documentIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, documentId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      const documentsRepository = createDocumentsRepository({ db });
      const documentVersionsRepository = createDocumentVersionsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { document: existingDocument } = await getDocumentOrThrow({ documentId, organizationId, documentsRepository });

      // Save current version to history
      await documentVersionsRepository.createDocumentVersion({
        documentId: existingDocument.id,
        organizationId,
        versionNumber: existingDocument.versionNumber ?? 1,
        originalName: existingDocument.originalName,
        originalSize: existingDocument.originalSize,
        originalStorageKey: existingDocument.originalStorageKey,
        originalSha256Hash: existingDocument.originalSha256Hash,
        mimeType: existingDocument.mimeType,
        createdBy: existingDocument.createdBy,
        fileEncryptionKeyWrapped: existingDocument.fileEncryptionKeyWrapped,
        fileEncryptionKekVersion: existingDocument.fileEncryptionKekVersion,
        fileEncryptionAlgorithm: existingDocument.fileEncryptionAlgorithm,
      });

      // Parse the new file upload
      const plansRepository = createPlansRepository({ config });
      const subscriptionsRepository = createSubscriptionsRepository({ db });
      const { organizationPlan } = await getOrganizationPlan({ organizationId, plansRepository, subscriptionsRepository });
      const { maxFileSize } = organizationPlan.limits;

      const { fileStream, fileName, mimeType } = await getFileStreamFromMultipartForm({
        body: context.req.raw.body,
        headers: context.req.header(),
        maxFileSize: isDocumentSizeLimitEnabled({ maxUploadSize: maxFileSize }) ? maxFileSize : undefined,
      });

      // Create new document (reuses full pipeline: hash, storage, etc.)
      const createDocument = createDocumentCreationUsecase({ db, config, taskServices, documentsStorageService, eventServices });

      const { document: newDocument } = await createDocument({
        fileStream,
        fileName,
        mimeType,
        userId,
        organizationId,
      });

      // Swap: update original document with new file data, delete the temp document record
      const newVersionNumber = (existingDocument.versionNumber ?? 1) + 1;

      await documentsRepository.updateDocumentFile({
        documentId: existingDocument.id,
        organizationId,
        originalName: newDocument.originalName,
        originalSize: newDocument.originalSize,
        originalStorageKey: newDocument.originalStorageKey,
        originalSha256Hash: newDocument.originalSha256Hash,
        mimeType: newDocument.mimeType,
        versionNumber: newVersionNumber,
      });

      // Delete the temporary new document record (we only needed its storage file)
      await documentsRepository.hardDeleteDocument({ documentId: newDocument.id });

      const { document: updatedDocument } = await getDocumentOrThrow({ documentId, organizationId, documentsRepository });

      eventServices.emitEvent({
        eventName: 'document.updated',
        payload: { document: updatedDocument, changes: { name: updatedDocument.name }, userId },
      });

      return context.json({ document: formatDocumentForApi({ document: updatedDocument }) });
    },
  );
}
