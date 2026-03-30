import type { Database } from '../app/database/database.types';
import { injectArguments } from '@corentinth/chisels';
import { desc, eq } from 'drizzle-orm';
import { documentVersionsTable } from './document-versions.table';

export type DocumentVersionsRepository = ReturnType<typeof createDocumentVersionsRepository>;

export function createDocumentVersionsRepository({ db }: { db: Database }) {
  return injectArguments({
    getDocumentVersions,
    createDocumentVersion,
  }, { db });
}

async function getDocumentVersions({
  documentId,
  db,
}: {
  documentId: string;
  db: Database;
}) {
  const versions = await db
    .select()
    .from(documentVersionsTable)
    .where(eq(documentVersionsTable.documentId, documentId))
    .orderBy(desc(documentVersionsTable.versionNumber));

  return { versions };
}

async function createDocumentVersion({
  documentId,
  organizationId,
  versionNumber,
  originalName,
  originalSize,
  originalStorageKey,
  originalSha256Hash,
  mimeType,
  createdBy,
  fileEncryptionKeyWrapped,
  fileEncryptionKekVersion,
  fileEncryptionAlgorithm,
  db,
}: {
  documentId: string;
  organizationId: string;
  versionNumber: number;
  originalName: string;
  originalSize: number;
  originalStorageKey: string;
  originalSha256Hash: string;
  mimeType: string;
  createdBy?: string | null;
  fileEncryptionKeyWrapped?: string | null;
  fileEncryptionKekVersion?: string | null;
  fileEncryptionAlgorithm?: string | null;
  db: Database;
}) {
  const [version] = await db
    .insert(documentVersionsTable)
    .values({
      documentId,
      organizationId,
      versionNumber,
      originalName,
      originalSize,
      originalStorageKey,
      originalSha256Hash,
      mimeType,
      createdBy,
      fileEncryptionKeyWrapped,
      fileEncryptionKekVersion,
      fileEncryptionAlgorithm,
    })
    .returning();

  return { version };
}
