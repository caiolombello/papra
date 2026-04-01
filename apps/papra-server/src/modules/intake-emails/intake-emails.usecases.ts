import type { Database } from '../app/database/database.types';
import type { CreateDocumentUsecase } from '../documents/documents.usecases';
import type { PlansRepository } from '../plans/plans.repository';
import type { Logger } from '../shared/logger/logger';
import type { SubscriptionsRepository } from '../subscriptions/subscriptions.repository';
import type { IntakeEmailsServices } from './drivers/intake-emails.drivers.models';
import type { IntakeEmailsRepository } from './intake-emails.repository';
import type { IntakeEmailUsernameServices } from './username-drivers/intake-email-username.services';
import { safely } from '@corentinth/chisels';
import { getOrganizationPlan } from '../plans/plans.usecases';
import { addLogContext, createLogger } from '../shared/logger/logger';
import { coerceFileMimeType } from '../shared/mime-types/mime-types.usecases';
import { fileToReadableStream } from '../shared/streams/readable-stream';
import { createIntakeEmailLimitReachedError, createIntakeEmailNotFoundError } from './intake-emails.errors';
import { getIsFromAllowedOrigin } from './intake-emails.models';

export async function createIntakeEmail({
  userId,
  organizationId,
  intakeEmailsRepository,
  intakeEmailsServices,
  plansRepository,
  subscriptionsRepository,
  intakeEmailUsernameServices,
}: {
  userId: string;
  organizationId: string;
  intakeEmailsRepository: IntakeEmailsRepository;
  intakeEmailsServices: IntakeEmailsServices;
  plansRepository: PlansRepository;
  subscriptionsRepository: SubscriptionsRepository;
  intakeEmailUsernameServices: IntakeEmailUsernameServices;
}) {
  await checkIfOrganizationCanCreateNewIntakeEmail({
    organizationId,
    plansRepository,
    subscriptionsRepository,
    intakeEmailsRepository,
  });

  const { username } = await intakeEmailUsernameServices.generateIntakeEmailUsername({ userId, organizationId });

  const { emailAddress } = await intakeEmailsServices.createEmailAddress({ username });

  const { intakeEmail } = await intakeEmailsRepository.createIntakeEmail({ organizationId, emailAddress });

  return { intakeEmail };
}

export async function processIntakeEmailIngestion({
  fromAddress,
  recipientsAddresses,
  attachments,
  subject = '',
  intakeEmailsRepository,
  createDocument,
  db,
  notificationServices,
}: {
  fromAddress: string;
  recipientsAddresses: string[];
  attachments: File[];
  subject?: string;
  intakeEmailsRepository: IntakeEmailsRepository;
  createDocument: CreateDocumentUsecase;
  db?: Database;
  notificationServices?: { notifyDocumentReceived: (args: { documentName: string; fromAddress?: string; subject?: string }) => Promise<void> };
}) {
  return Promise.all(
    recipientsAddresses.map(async recipientAddress => safely(
      ingestEmailForRecipient({
        fromAddress,
        recipientAddress,
        attachments,
        subject,
        intakeEmailsRepository,
        createDocument,
        db,
        notificationServices,
      }),
    )),
  );
}

export async function ingestEmailForRecipient({
  fromAddress,
  recipientAddress,
  attachments,
  subject = '',
  intakeEmailsRepository,
  db,
  notificationServices,
  logger = createLogger({ namespace: 'intake-emails.ingest' }),
  createDocument,
}: {
  fromAddress: string;
  recipientAddress: string;
  attachments: File[];
  subject?: string;
  intakeEmailsRepository: IntakeEmailsRepository;
  db?: Database;
  notificationServices?: { notifyDocumentReceived: (args: { documentName: string; fromAddress?: string; subject?: string }) => Promise<void> };
  logger?: Logger;
  createDocument: CreateDocumentUsecase;
}) {
  const { intakeEmail } = await intakeEmailsRepository.getIntakeEmailByEmailAddress({ emailAddress: recipientAddress });

  if (!intakeEmail) {
    logger.info({ recipientAddress }, 'Intake email not found');

    return;
  }

  addLogContext({ intakeEmailId: intakeEmail.id });

  if (!intakeEmail.isEnabled) {
    logger.info('Intake email is disabled');

    return;
  }

  const isFromAllowedOrigin = getIsFromAllowedOrigin({
    origin: fromAddress,
    allowedOrigins: intakeEmail.allowedOrigins,
  });

  if (!isFromAllowedOrigin) {
    logger.warn({ fromAddress }, 'Origin not allowed');

    return;
  }

  const documentIds: string[] = [];
  const errors: string[] = [];

  await Promise.all(attachments.map(async (file) => {
    const { mimeType } = await coerceFileMimeType({ file });

    const [result, error] = await safely(createDocument({
      fileStream: fileToReadableStream(file),
      fileName: file.name,
      mimeType,
      organizationId: intakeEmail.organizationId,
      emailSubject: subject,
    }));

    if (error) {
      logger.error({ error }, 'Failed to create document for intake email ingestion');
      errors.push(error.message);
    } else {
      logger.info({ documentId: result.document.id }, 'Document created for intake email ingestion');
      documentIds.push(result.document.id);
    }
  }));

  // Log the intake email
  if (db) {
    try {
      const { intakeEmailLogTable } = await import('./intake-email-log.table');
      await db.insert(intakeEmailLogTable).values({
        organizationId: intakeEmail.organizationId,
        intakeEmailId: intakeEmail.id,
        fromAddress,
        subject,
        attachmentsCount: attachments.length,
        status: errors.length > 0 ? (documentIds.length > 0 ? 'partial' : 'failed') : 'success',
        errorMessage: errors.length > 0 ? errors.join('; ') : null,
        documentIds: documentIds.length > 0 ? JSON.stringify(documentIds) : null,
      });
    } catch (logError) {
      logger.error({ error: logError }, 'Failed to log intake email');
    }
  }

  // Send notification for each created document
  if (notificationServices && documentIds.length > 0) {
    for (const file of attachments) {
      notificationServices.notifyDocumentReceived({
        documentName: file.name,
        fromAddress,
        subject,
      }).catch(() => {}); // Fire and forget
    }
  }
}

export async function checkIfOrganizationCanCreateNewIntakeEmail({
  organizationId,
  plansRepository,
  subscriptionsRepository,
  intakeEmailsRepository,
}: {
  organizationId: string;
  plansRepository: PlansRepository;
  subscriptionsRepository: SubscriptionsRepository;
  intakeEmailsRepository: IntakeEmailsRepository;
}) {
  const { intakeEmailCount } = await intakeEmailsRepository.getOrganizationIntakeEmailsCount({ organizationId });
  const { organizationPlan } = await getOrganizationPlan({ organizationId, plansRepository, subscriptionsRepository });

  if (intakeEmailCount >= organizationPlan.limits.maxIntakeEmailsCount) {
    throw createIntakeEmailLimitReachedError();
  }
}

export async function deleteIntakeEmail({
  intakeEmailId,
  organizationId,
  intakeEmailsRepository,
  intakeEmailsServices,
}: {
  intakeEmailId: string;
  organizationId: string;
  intakeEmailsRepository: IntakeEmailsRepository;
  intakeEmailsServices: IntakeEmailsServices;
}) {
  const { intakeEmail } = await intakeEmailsRepository.getIntakeEmail({ intakeEmailId, organizationId });

  if (!intakeEmail) {
    throw createIntakeEmailNotFoundError();
  }

  await intakeEmailsRepository.deleteIntakeEmail({ organizationId: intakeEmail.organizationId, intakeEmailId });
  await intakeEmailsServices.deleteEmailAddress({ emailAddress: intakeEmail.emailAddress });
}
