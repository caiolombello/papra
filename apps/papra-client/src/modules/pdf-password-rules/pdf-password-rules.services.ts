import type { AsDto } from '../shared/http/http-client.types';
import { apiClient } from '../shared/http/api-client';
import { coerceDates } from '../shared/http/http-client.models';

export type PdfPasswordRule = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  organizationId: string;
  name: string;
  subjectPattern: string;
  password: string;
  enabled: number;
  priority: number;
};

export type PdfPasswordRuleForCreation = {
  name: string;
  subjectPattern: string;
  password: string;
  enabled?: boolean;
  priority?: number;
};

export async function fetchPdfPasswordRules({ organizationId }: { organizationId: string }) {
  const { rules } = await apiClient<{ rules: AsDto<PdfPasswordRule>[] }>({
    path: `/api/organizations/${organizationId}/pdf-password-rules`,
    method: 'GET',
  });

  return { rules: rules.map(coerceDates) };
}

export async function createPdfPasswordRule({
  organizationId,
  rule,
}: {
  organizationId: string;
  rule: PdfPasswordRuleForCreation;
}) {
  const { rule: created } = await apiClient<{ rule: AsDto<PdfPasswordRule> }>({
    path: `/api/organizations/${organizationId}/pdf-password-rules`,
    method: 'POST',
    body: rule,
  });

  return { rule: coerceDates(created) };
}

export async function updatePdfPasswordRule({
  organizationId,
  ruleId,
  updates,
}: {
  organizationId: string;
  ruleId: string;
  updates: Partial<PdfPasswordRuleForCreation>;
}) {
  const { rule: updated } = await apiClient<{ rule: AsDto<PdfPasswordRule> }>({
    path: `/api/organizations/${organizationId}/pdf-password-rules/${ruleId}`,
    method: 'PUT',
    body: updates,
  });

  return { rule: coerceDates(updated) };
}

export async function deletePdfPasswordRule({
  organizationId,
  ruleId,
}: {
  organizationId: string;
  ruleId: string;
}) {
  await apiClient({
    path: `/api/organizations/${organizationId}/pdf-password-rules/${ruleId}`,
    method: 'DELETE',
  });
}
