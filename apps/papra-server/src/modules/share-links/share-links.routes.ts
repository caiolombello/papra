import type { RouteDefinitionContext } from '../app/server.types';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { organizationIdSchema } from '../organizations/organization.schemas';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { createError } from '../shared/errors/errors';
import { validateJsonBody, validateParams, validateQuery } from '../shared/validation/validation';
import { createDocumentsRepository } from '../documents/documents.repository';
import { createMeetingsRepository } from '../meetings/meetings.repository';
import { createAuditLogger } from '../security-audit/security-audit.service';
import { createShareLinksRepository, verifyPassword } from './share-links.repository';

export function registerShareLinksRoutes(context: RouteDefinitionContext) {
  setupCreateShareLinkRoute(context);
  setupListShareLinksRoute(context);
  setupRevokeShareLinkRoute(context);
  setupAccessShareLinkRoute(context);
  setupShareLinkFileRoute(context);
}

function setupCreateShareLinkRoute({ app, db }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/share-links',
    requireAuthentication(),
    validateParams(z.object({ organizationId: organizationIdSchema })),
    validateJsonBody(z.object({
      resourceType: z.enum(['document', 'meeting']),
      resourceId: z.string().min(1),
      password: z.string().min(1).optional(),
      expiresInHours: z.number().int().min(1).max(720).default(24), // max 30 days
      maxViews: z.number().int().min(1).optional(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { resourceType, resourceId, password, expiresInHours, maxViews } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      // Verify resource exists
      if (resourceType === 'document') {
        const documentsRepository = createDocumentsRepository({ db });
        const { document } = await documentsRepository.getDocumentById({ documentId: resourceId, organizationId });
        if (!document) throw createError({ message: 'Document not found', code: 'share.resource_not_found', statusCode: 404 });
      } else {
        const meetingsRepository = createMeetingsRepository({ db });
        const { meeting } = await meetingsRepository.getMeetingById({ organizationId, meetingId: resourceId });
        if (!meeting) throw createError({ message: 'Meeting not found', code: 'share.resource_not_found', statusCode: 404 });
      }

      const shareLinksRepository = createShareLinksRepository({ db });
      const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

      const { shareLink, token } = await shareLinksRepository.createShareLink({
        organizationId,
        createdBy: userId,
        resourceType,
        resourceId,
        password,
        expiresAt,
        maxViews,
      });

      const baseUrl = context.req.header('origin') || context.req.header('x-forwarded-proto') + '://' + context.req.header('host') || '';
      const shareUrl = `${baseUrl}/share/${token}`;

      return context.json({
        shareLink: {
          ...shareLink,
          hasPassword: !!shareLink.passwordHash,
          passwordHash: undefined,
        },
        shareUrl,
      }, 201);
    },
  );
}

function setupListShareLinksRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/share-links',
    requireAuthentication(),
    validateParams(z.object({ organizationId: organizationIdSchema })),
    validateQuery(z.object({
      resourceType: z.string().optional(),
      resourceId: z.string().optional(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { resourceType, resourceId } = context.req.valid('query');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const shareLinksRepository = createShareLinksRepository({ db });
      const { links } = await shareLinksRepository.listShareLinks({ organizationId, resourceType, resourceId });

      return context.json({
        links: links.map(link => ({
          ...link,
          hasPassword: !!link.passwordHash,
          passwordHash: undefined,
          isExpired: new Date() > link.expiresAt,
          isMaxViewsReached: link.maxViews !== null && link.viewCount >= link.maxViews,
        })),
      });
    },
  );
}

function setupRevokeShareLinkRoute({ app, db }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/share-links/:shareLinkId',
    requireAuthentication(),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      shareLinkId: z.string(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, shareLinkId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const shareLinksRepository = createShareLinksRepository({ db });
      await shareLinksRepository.revokeShareLink({ id: shareLinkId, organizationId });

      return context.body(null, 204);
    },
  );
}

function setupAccessShareLinkRoute({ app, db, documentsStorageService }: RouteDefinitionContext) {
  // Public endpoint — no auth required
  app.post(
    '/api/share/:token',
    validateParams(z.object({ token: z.string() })),
    async (context) => {
      const { token } = context.req.valid('param');

      // Optional password in body
      let password: string | undefined;
      try {
        const body = await context.req.json();
        password = body?.password;
      } catch {
        // No body or not JSON — that's fine
      }

      const shareLinksRepository = createShareLinksRepository({ db });
      const { shareLink } = await shareLinksRepository.getShareLinkByToken({ token });

      if (!shareLink) {
        throw createError({ message: 'Share link not found', code: 'share.not_found', statusCode: 404 });
      }

      if (shareLink.isRevoked) {
        throw createError({ message: 'This share link has been revoked', code: 'share.revoked', statusCode: 410 });
      }

      if (new Date() > shareLink.expiresAt) {
        throw createError({ message: 'This share link has expired', code: 'share.expired', statusCode: 410 });
      }

      if (shareLink.maxViews !== null && shareLink.viewCount >= shareLink.maxViews) {
        throw createError({ message: 'This share link has reached the maximum number of views', code: 'share.max_views_reached', statusCode: 410 });
      }

      if (shareLink.passwordHash) {
        if (!password) {
          return context.json({ requiresPassword: true }, 401);
        }
        if (!verifyPassword(password, shareLink.passwordHash)) {
          throw createError({ message: 'Incorrect password', code: 'share.wrong_password', statusCode: 403 });
        }
      }

      // Increment view count
      await shareLinksRepository.incrementViewCount({ token });

      // Audit log
      const auditLogger = createAuditLogger({ db });
      auditLogger.logFromContext(context, {
        organizationId: shareLink.organizationId,
        action: 'document.viewed',
        resourceType: shareLink.resourceType,
        resourceId: shareLink.resourceId,
        details: { via: 'share_link', shareLinkId: shareLink.id },
      });

      // Return the resource data
      if (shareLink.resourceType === 'document') {
        const documentsRepository = createDocumentsRepository({ db });
        const { document } = await documentsRepository.getDocumentById({
          documentId: shareLink.resourceId,
          organizationId: shareLink.organizationId,
        });

        if (!document) {
          throw createError({ message: 'Document no longer exists', code: 'share.resource_gone', statusCode: 410 });
        }

        return context.json({
          type: 'document',
          document: {
            name: document.name,
            mimeType: document.mimeType,
            originalSize: document.originalSize,
            content: document.content,
            createdAt: document.createdAt,
          },
        });
      }

      if (shareLink.resourceType === 'meeting') {
        const meetingsRepository = createMeetingsRepository({ db });
        const { meeting } = await meetingsRepository.getMeetingById({
          organizationId: shareLink.organizationId,
          meetingId: shareLink.resourceId,
        });

        if (!meeting) {
          throw createError({ message: 'Meeting no longer exists', code: 'share.resource_gone', statusCode: 410 });
        }

        const { chunks } = await meetingsRepository.getMeetingChunks({ meetingId: shareLink.resourceId });

        return context.json({
          type: 'meeting',
          meeting: {
            title: meeting.title,
            summary: meeting.summary,
            language: meeting.language,
            context: meeting.context,
            createdAt: meeting.createdAt,
            chunks: chunks.map(c => ({
              speaker: c.speaker,
              startedAtMs: c.startedAtMs,
              endedAtMs: c.endedAtMs,
              content: c.content,
            })),
          },
        });
      }

      throw createError({ message: 'Unknown resource type', code: 'share.unknown_type', statusCode: 400 });
    },
  );
}

function setupShareLinkFileRoute({ app, db, documentsStorageService }: RouteDefinitionContext) {
  // Public endpoint — serves the actual file for document share links
  app.get(
    '/api/share/:token/file',
    validateParams(z.object({ token: z.string() })),
    async (context) => {
      const { token } = context.req.valid('param');
      const password = context.req.query('password') ?? undefined;

      const shareLinksRepository = createShareLinksRepository({ db });
      const { shareLink } = await shareLinksRepository.getShareLinkByToken({ token });

      if (!shareLink) {
        throw createError({ message: 'Share link not found', code: 'share.not_found', statusCode: 404 });
      }

      if (shareLink.isRevoked) {
        throw createError({ message: 'This share link has been revoked', code: 'share.revoked', statusCode: 410 });
      }

      if (new Date() > shareLink.expiresAt) {
        throw createError({ message: 'This share link has expired', code: 'share.expired', statusCode: 410 });
      }

      if (shareLink.maxViews !== null && shareLink.viewCount >= shareLink.maxViews) {
        throw createError({ message: 'Max views reached', code: 'share.max_views_reached', statusCode: 410 });
      }

      if (shareLink.passwordHash) {
        if (!password || !verifyPassword(password, shareLink.passwordHash)) {
          throw createError({ message: 'Password required or incorrect', code: 'share.wrong_password', statusCode: 403 });
        }
      }

      if (shareLink.resourceType !== 'document') {
        throw createError({ message: 'File download only available for documents', code: 'share.not_document', statusCode: 400 });
      }

      const documentsRepository = createDocumentsRepository({ db });
      const { document } = await documentsRepository.getDocumentById({
        documentId: shareLink.resourceId,
        organizationId: shareLink.organizationId,
      });

      if (!document) {
        throw createError({ message: 'Document no longer exists', code: 'share.resource_gone', statusCode: 410 });
      }

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
          'Content-Type': document.mimeType,
          'Content-Length': String(document.originalSize),
          'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(document.name)}`,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-store',
        },
      );
    },
  );
}
