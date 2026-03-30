import type { Database } from '../app/database/database.types';
import { injectArguments } from '@corentinth/chisels';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { documentFoldersTable } from './document-folders.table';

export type DocumentFoldersRepository = ReturnType<typeof createDocumentFoldersRepository>;

export function createDocumentFoldersRepository({ db }: { db: Database }) {
  return injectArguments({
    listFolders,
    createFolder,
    renameFolder,
    deleteFolder,
    getFolderById,
    getFolderPath,
  }, { db });
}

async function listFolders({
  organizationId,
  parentId,
  db,
}: {
  organizationId: string;
  parentId: string | null;
  db: Database;
}) {
  const folders = await db
    .select()
    .from(documentFoldersTable)
    .where(and(
      eq(documentFoldersTable.organizationId, organizationId),
      parentId === null
        ? isNull(documentFoldersTable.parentId)
        : eq(documentFoldersTable.parentId, parentId),
    ))
    .orderBy(documentFoldersTable.name);

  return { folders };
}

async function createFolder({
  organizationId,
  name,
  parentId,
  db,
}: {
  organizationId: string;
  name: string;
  parentId: string | null;
  db: Database;
}) {
  const [folder] = await db
    .insert(documentFoldersTable)
    .values({
      organizationId,
      name,
      parentId,
    })
    .returning();

  if (!folder) {
    throw new Error('Failed to create folder');
  }

  return { folder };
}

async function renameFolder({
  folderId,
  organizationId,
  name,
  db,
}: {
  folderId: string;
  organizationId: string;
  name: string;
  db: Database;
}) {
  const [folder] = await db
    .update(documentFoldersTable)
    .set({ name, updatedAt: new Date() })
    .where(and(
      eq(documentFoldersTable.id, folderId),
      eq(documentFoldersTable.organizationId, organizationId),
    ))
    .returning();

  return { folder };
}

async function deleteFolder({
  folderId,
  organizationId,
  db,
}: {
  folderId: string;
  organizationId: string;
  db: Database;
}) {
  await db
    .delete(documentFoldersTable)
    .where(and(
      eq(documentFoldersTable.id, folderId),
      eq(documentFoldersTable.organizationId, organizationId),
    ));
}

async function getFolderById({
  folderId,
  organizationId,
  db,
}: {
  folderId: string;
  organizationId: string;
  db: Database;
}) {
  const [folder] = await db
    .select()
    .from(documentFoldersTable)
    .where(and(
      eq(documentFoldersTable.id, folderId),
      eq(documentFoldersTable.organizationId, organizationId),
    ));

  return { folder };
}

async function getFolderPath({
  folderId,
  organizationId,
  db,
}: {
  folderId: string;
  organizationId: string;
  db: Database;
}) {
  const path: Array<{ id: string; name: string; parentId: string | null }> = [];
  let currentId: string | null = folderId;

  while (currentId) {
    const { folder } = await getFolderById({ folderId: currentId, organizationId, db });

    if (!folder) {
      break;
    }

    path.unshift({ id: folder.id, name: folder.name, parentId: folder.parentId });
    currentId = folder.parentId;
  }

  return { path };
}
