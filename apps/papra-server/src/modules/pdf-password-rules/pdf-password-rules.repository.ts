import type { Database } from '../app/database/database.types';
import { injectArguments } from '@corentinth/chisels';
import { and, desc, eq } from 'drizzle-orm';
import { pdfPasswordRulesTable } from './pdf-password-rules.table';

export type PdfPasswordRulesRepository = ReturnType<typeof createPdfPasswordRulesRepository>;

export function createPdfPasswordRulesRepository({ db }: { db: Database }) {
  return injectArguments({
    listOrganizationPdfPasswordRules,
    createPdfPasswordRule,
    updatePdfPasswordRule,
    deletePdfPasswordRule,
    getPdfPasswordRuleById,
    findEnabledRulesByOrganization,
  }, { db });
}

async function listOrganizationPdfPasswordRules({
  organizationId,
  db,
}: {
  organizationId: string;
  db: Database;
}) {
  const rules = await db
    .select()
    .from(pdfPasswordRulesTable)
    .where(eq(pdfPasswordRulesTable.organizationId, organizationId))
    .orderBy(desc(pdfPasswordRulesTable.priority), pdfPasswordRulesTable.createdAt);

  return { rules };
}

async function createPdfPasswordRule({
  organizationId,
  name,
  subjectPattern,
  password,
  enabled = 1,
  priority = 0,
  db,
}: {
  organizationId: string;
  name: string;
  subjectPattern: string;
  password: string;
  enabled?: number;
  priority?: number;
  db: Database;
}) {
  const [rule] = await db
    .insert(pdfPasswordRulesTable)
    .values({
      organizationId,
      name,
      subjectPattern,
      password,
      enabled,
      priority,
    })
    .returning();

  if (!rule) {
    throw new Error('Failed to create PDF password rule');
  }

  return { rule };
}

async function updatePdfPasswordRule({
  ruleId,
  organizationId,
  name,
  subjectPattern,
  password,
  enabled,
  priority,
  db,
}: {
  ruleId: string;
  organizationId: string;
  name?: string;
  subjectPattern?: string;
  password?: string;
  enabled?: number;
  priority?: number;
  db: Database;
}) {
  const [rule] = await db
    .update(pdfPasswordRulesTable)
    .set({
      ...(name !== undefined && { name }),
      ...(subjectPattern !== undefined && { subjectPattern }),
      ...(password !== undefined && { password }),
      ...(enabled !== undefined && { enabled }),
      ...(priority !== undefined && { priority }),
      updatedAt: new Date(),
    })
    .where(and(
      eq(pdfPasswordRulesTable.id, ruleId),
      eq(pdfPasswordRulesTable.organizationId, organizationId),
    ))
    .returning();

  return { rule };
}

async function deletePdfPasswordRule({
  ruleId,
  organizationId,
  db,
}: {
  ruleId: string;
  organizationId: string;
  db: Database;
}) {
  await db
    .delete(pdfPasswordRulesTable)
    .where(and(
      eq(pdfPasswordRulesTable.id, ruleId),
      eq(pdfPasswordRulesTable.organizationId, organizationId),
    ));
}

async function getPdfPasswordRuleById({
  ruleId,
  organizationId,
  db,
}: {
  ruleId: string;
  organizationId: string;
  db: Database;
}) {
  const [rule] = await db
    .select()
    .from(pdfPasswordRulesTable)
    .where(and(
      eq(pdfPasswordRulesTable.id, ruleId),
      eq(pdfPasswordRulesTable.organizationId, organizationId),
    ));

  return { rule };
}

async function findEnabledRulesByOrganization({
  organizationId,
  db,
}: {
  organizationId: string;
  db: Database;
}) {
  const rules = await db
    .select()
    .from(pdfPasswordRulesTable)
    .where(and(
      eq(pdfPasswordRulesTable.organizationId, organizationId),
      eq(pdfPasswordRulesTable.enabled, 1),
    ))
    .orderBy(desc(pdfPasswordRulesTable.priority), pdfPasswordRulesTable.createdAt);

  return { rules };
}
