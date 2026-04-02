import type { RouteDefinitionContext } from '../app/server.types';
import { verifySignature } from '@owlrelay/webhook';
import { z } from 'zod';
import { createUnauthorizedError } from '../app/auth/auth.errors';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { createDocumentCreationUsecase } from '../documents/documents.usecases';
import { organizationIdSchema } from '../organizations/organization.schemas';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { createPlansRepository } from '../plans/plans.repository';
import { createError } from '../shared/errors/errors';
import { getHeader } from '../shared/headers/headers.models';
import { addLogContext, createLogger } from '../shared/logger/logger';
import { isNil } from '../shared/utils';
import { validateFormData, validateJsonBody, validateParams, validateQuery } from '../shared/validation/validation';
import { createSubscriptionsRepository } from '../subscriptions/subscriptions.repository';
import { createUsersRepository } from '../users/users.repository';
import { INTAKE_EMAILS_INGEST_ROUTE } from './intake-emails.constants';
import { getRecipientAddresses } from './intake-emails.models';
import { createIntakeEmailsRepository } from './intake-emails.repository';
import { allowedOriginsSchema, intakeEmailIdSchema, intakeEmailsIngestionMetaSchema, parseJson } from './intake-emails.schemas';
import { createIntakeEmailsServices } from './intake-emails.services';
import { createEmailsServices } from '../emails/emails.services';
import { createNotificationServices } from '../notifications/notifications.service';
import { createIntakeEmail, deleteIntakeEmail, processIntakeEmailIngestion } from './intake-emails.usecases';
import { createIntakeEmailUsernameServices } from './username-drivers/intake-email-username.services';

const logger = createLogger({ namespace: 'intake-emails.routes' });

export function registerIntakeEmailsRoutes(context: RouteDefinitionContext) {
  setupIngestIntakeEmailRoute(context);
  setupGetOrganizationIntakeEmailsRoute(context);
  setupGetIntakeEmailLogRoute(context);
  setupCreateIntakeEmailRoute(context);
  setupDeleteIntakeEmailRoute(context);
  setupUpdateIntakeEmailRoute(context);
}

function setupGetIntakeEmailLogRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/intake-emails/log',
    requireAuthentication(),
    validateParams(z.object({ organizationId: organizationIdSchema })),
    validateQuery(z.object({
      pageIndex: z.coerce.number().int().min(0).default(0),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { pageIndex, pageSize } = context.req.valid('query');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { intakeEmailLogTable } = await import('./intake-email-log.table');
      const { desc, eq, sql } = await import('drizzle-orm');

      const [entries, countResult] = await Promise.all([
        db.select()
          .from(intakeEmailLogTable)
          .where(eq(intakeEmailLogTable.organizationId, organizationId))
          .orderBy(desc(intakeEmailLogTable.createdAt))
          .limit(pageSize)
          .offset(pageIndex * pageSize),
        db.select({ count: sql<number>`COUNT(*)` })
          .from(intakeEmailLogTable)
          .where(eq(intakeEmailLogTable.organizationId, organizationId)),
      ]);

      return context.json({
        entries: entries.map(e => ({
          ...e,
          documentIds: e.documentIds ? JSON.parse(e.documentIds) : [],
        })),
        totalCount: countResult[0]?.count ?? 0,
      });
    },
  );
}

function setupGetOrganizationIntakeEmailsRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/intake-emails',
    requireAuthentication(),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      const intakeEmailsRepository = createIntakeEmailsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { intakeEmails } = await intakeEmailsRepository.getOrganizationIntakeEmails({ organizationId });

      return context.json({ intakeEmails });
    },
  );
}

function setupCreateIntakeEmailRoute({ app, db, config }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/intake-emails',
    requireAuthentication(),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');

      const usersRepository = createUsersRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });
      const intakeEmailsRepository = createIntakeEmailsRepository({ db });
      const intakeEmailsServices = createIntakeEmailsServices({ config });
      const plansRepository = createPlansRepository({ config });
      const subscriptionsRepository = createSubscriptionsRepository({ db });
      const intakeEmailUsernameServices = createIntakeEmailUsernameServices({ config, usersRepository, organizationsRepository });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { intakeEmail } = await createIntakeEmail({
        userId,
        organizationId,
        intakeEmailsRepository,
        intakeEmailsServices,
        plansRepository,
        subscriptionsRepository,
        intakeEmailUsernameServices,
      });

      return context.json({ intakeEmail });
    },
  );
}

function setupDeleteIntakeEmailRoute({ app, db, config }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/intake-emails/:intakeEmailId',
    requireAuthentication(),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      intakeEmailId: intakeEmailIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, intakeEmailId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      const intakeEmailsRepository = createIntakeEmailsRepository({ db });
      const intakeEmailsServices = createIntakeEmailsServices({ config });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      await deleteIntakeEmail({ intakeEmailId, organizationId, intakeEmailsRepository, intakeEmailsServices });

      return context.body(null, 204);
    },
  );
}

function setupUpdateIntakeEmailRoute({ app, db }: RouteDefinitionContext) {
  app.put(
    '/api/organizations/:organizationId/intake-emails/:intakeEmailId',
    requireAuthentication(),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      intakeEmailId: intakeEmailIdSchema,
    })),
    validateJsonBody(z.object({
      isEnabled: z.boolean().optional(),
      allowedOrigins: allowedOriginsSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, intakeEmailId } = context.req.valid('param');
      const { isEnabled, allowedOrigins } = context.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      const intakeEmailsRepository = createIntakeEmailsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { intakeEmail } = await intakeEmailsRepository.updateIntakeEmail({
        intakeEmailId,
        organizationId,
        isEnabled,
        allowedOrigins,
      });

      return context.json({ intakeEmail });
    },
  );
}

function setupIngestIntakeEmailRoute({ app, db, config, taskServices, documentsStorageService, eventServices }: RouteDefinitionContext) {
  app.post(
    INTAKE_EMAILS_INGEST_ROUTE,
    async (context) => {
      if (!config.intakeEmails.isEnabled) {
        throw createError({
          message: 'Intake emails are disabled',
          code: 'intake_emails.disabled',
          statusCode: 403,
        });
      }

      // Read body ONCE for both signature verification and form parsing
      const bodyBuffer = await context.req.arrayBuffer();
      const signature = getHeader({ context, name: 'X-Signature' });

      if (isNil(signature)) {
        throw createError({
          message: 'Signature header is required',
          code: 'intake_emails.signature_header_required',
          statusCode: 400,
        });
      }

      const isSignatureValid = await verifySignature({
        signature,
        bodyBuffer,
        secret: config.intakeEmails.webhookSecret,
      });

      if (!isSignatureValid) {
        logger.error({ signature }, 'Invalid webhook signature');

        throw createUnauthorizedError();
      }

      // Parse multipart form data from the buffered body
      const contentType = context.req.header('content-type') ?? '';
      const { Readable } = await import('node:stream');
      const createBusboy = (await import('busboy')).default;
      const { Buffer } = await import('node:buffer');

      const bodyBytes = Buffer.from(bodyBuffer);
      logger.info({ bodySize: bodyBytes.length, contentType }, 'Parsing intake email multipart body');

      type ParsedAttachment = { filename: string; mimeType: string; buffer: Buffer };
      const { email, attachments } = await new Promise<{ email: any; attachments: ParsedAttachment[] }>((resolve, reject) => {
        let emailJson: any = null;
        const files: ParsedAttachment[] = [];

        const bb = createBusboy({
          headers: { 'content-type': contentType },
          limits: { files: 20 },
          defParamCharset: 'utf8',
        });

        bb.on('field', (name: string, value: string) => {
          if (name === 'email') {
            try { emailJson = JSON.parse(value); } catch { emailJson = null; }
          }
        });

        bb.on('file', (name: string, stream: any, info: any) => {
          if (!name.startsWith('attachments')) {
            stream.resume();
            return;
          }
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => {
            const buffer = Buffer.concat(chunks);
            logger.info({ filename: info.filename, fileSize: buffer.length, mime: info.mimeType }, 'Parsed attachment from multipart');
            files.push({ filename: info.filename || 'file', mimeType: info.mimeType || 'application/octet-stream', buffer });
          });
        });

        bb.on('close', () => {
          logger.info({ emailParsed: !!emailJson, fileCount: files.length }, 'Multipart parsing complete');
          resolve({ email: emailJson, attachments: files });
        });
        bb.on('error', (err: Error) => {
          logger.error({ error: err }, 'Busboy parsing error');
          reject(err);
        });

        const readable = new Readable();
        readable.push(bodyBytes);
        readable.push(null);
        readable.pipe(bb);
      });

      if (!email?.from?.address) {
        throw createError({ message: 'Invalid email payload', code: 'intake_emails.invalid_payload', statusCode: 400 });
      }

      const fromAddress = email.from.address;
      const safeEmail = {
        to: Array.isArray(email.to) ? email.to : [],
        originalTo: Array.isArray(email.originalTo) ? email.originalTo : [],
      };
      const recipientsAddresses = getRecipientAddresses({ email: safeEmail });
      const subject = email.subject ?? '';

      addLogContext({ fromAddress, recipientsAddresses });

      logger.info({ attachmentsCount: attachments.length, subject }, 'Received intake email ingestion request');

      const intakeEmailsRepository = createIntakeEmailsRepository({ db });

      const createDocument = createDocumentCreationUsecase({
        documentsStorageService,
        db,
        config,
        taskServices,
        eventServices,
      });

      let notificationServices: ReturnType<typeof createNotificationServices> | undefined;
      try {
        const emailServices = createEmailsServices({ config });
        const notifyEmail = process.env.NOTIFICATIONS_EMAIL?.trim() || undefined;
        notificationServices = createNotificationServices({ emailServices, notifyEmail });
      } catch {
        // Email services not configured, skip notifications
      }

      // Create File objects with _buffer for direct stream access (bypasses broken File.stream()/arrayBuffer())
      const fileAttachments = attachments.map((a) => {
        const file = new File([a.buffer], a.filename, { type: a.mimeType });
        (file as any)._buffer = a.buffer;
        return file;
      });

      await processIntakeEmailIngestion({
        fromAddress,
        recipientsAddresses,
        attachments: fileAttachments,
        subject,
        intakeEmailsRepository,
        createDocument,
        db,
        notificationServices,
      });

      return context.body(null, 202);
    },
  );
}
