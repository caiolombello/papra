import type { Database } from '../app/database/database.types';
import { randomBytes, createHash } from 'node:crypto';
import { injectArguments } from '@corentinth/chisels';
import { and, desc, eq, sql } from 'drizzle-orm';
import { shareLinksTable } from './share-links.table';

export type ShareLinksRepository = ReturnType<typeof createShareLinksRepository>;

export function createShareLinksRepository({ db }: { db: Database }) {
  return injectArguments({
    createShareLink,
    getShareLinkByToken,
    listShareLinks,
    revokeShareLink,
    incrementViewCount,
  }, { db });
}

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

async function createShareLink({
  organizationId,
  createdBy,
  resourceType,
  resourceId,
  password,
  expiresAt,
  maxViews,
  db,
}: {
  organizationId: string;
  createdBy: string;
  resourceType: string;
  resourceId: string;
  password?: string;
  expiresAt: Date;
  maxViews?: number;
  db: Database;
}) {
  const token = generateToken();

  const [shareLink] = await db
    .insert(shareLinksTable)
    .values({
      organizationId,
      createdBy,
      token,
      resourceType,
      resourceId,
      passwordHash: password ? hashPassword(password) : null,
      expiresAt,
      maxViews: maxViews ?? null,
    })
    .returning();

  return { shareLink: shareLink!, token };
}

async function getShareLinkByToken({ token, db }: { token: string; db: Database }) {
  const [shareLink] = await db
    .select()
    .from(shareLinksTable)
    .where(eq(shareLinksTable.token, token));

  return { shareLink };
}

async function listShareLinks({
  organizationId,
  resourceType,
  resourceId,
  db,
}: {
  organizationId: string;
  resourceType?: string;
  resourceId?: string;
  db: Database;
}) {
  const conditions = [eq(shareLinksTable.organizationId, organizationId)];
  if (resourceType) conditions.push(eq(shareLinksTable.resourceType, resourceType));
  if (resourceId) conditions.push(eq(shareLinksTable.resourceId, resourceId));

  const links = await db
    .select()
    .from(shareLinksTable)
    .where(and(...conditions))
    .orderBy(desc(shareLinksTable.createdAt));

  return { links };
}

async function revokeShareLink({
  id,
  organizationId,
  db,
}: {
  id: string;
  organizationId: string;
  db: Database;
}) {
  await db
    .update(shareLinksTable)
    .set({ isRevoked: true })
    .where(and(eq(shareLinksTable.id, id), eq(shareLinksTable.organizationId, organizationId)));
}

async function incrementViewCount({ token, db }: { token: string; db: Database }) {
  await db
    .update(shareLinksTable)
    .set({ viewCount: sql`${shareLinksTable.viewCount} + 1` })
    .where(eq(shareLinksTable.token, token));
}
