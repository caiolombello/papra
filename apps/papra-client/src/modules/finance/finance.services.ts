import type { FinanceAccount, FinanceBill, FinanceBudget, FinanceCategory, FinanceCategoryRule, FinanceDashboard, FinanceInvestment, FinanceItem, FinanceTransaction } from './finance.types';
import { apiClient } from '../shared/http/api-client';

export async function fetchFinanceDashboard({
  organizationId,
  financialMonth,
}: {
  organizationId: string;
  financialMonth?: string;
}) {
  return apiClient<FinanceDashboard>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/finance/dashboard`,
    query: { ...(financialMonth ? { financialMonth } : {}) },
  });
}

export async function fetchFinanceTransactions({
  organizationId,
  pageIndex,
  pageSize,
  accountId,
  categoryId,
  type,
  from,
  to,
  search,
  financialMonth,
}: {
  organizationId: string;
  pageIndex: number;
  pageSize: number;
  accountId?: string;
  categoryId?: string;
  type?: string;
  from?: string;
  to?: string;
  search?: string;
  financialMonth?: string;
}) {
  return apiClient<{ transactions: FinanceTransaction[]; total: number }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/finance/transactions`,
    query: {
      pageIndex,
      pageSize,
      ...(accountId ? { accountId } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(type ? { type } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(search ? { search } : {}),
      ...(financialMonth ? { financialMonth } : {}),
    },
  });
}

export async function updateTransactionCategory({
  organizationId,
  transactionId,
  categoryId,
}: {
  organizationId: string;
  transactionId: string;
  categoryId: string | null;
}) {
  return apiClient<{ transaction: FinanceTransaction }>({
    method: 'PATCH',
    path: `/api/organizations/${organizationId}/finance/transactions/${transactionId}`,
    body: { categoryId },
  });
}

export async function fetchFinanceInvestments({
  organizationId,
}: {
  organizationId: string;
}) {
  return apiClient<{ investments: FinanceInvestment[] }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/finance/investments`,
  });
}

export async function fetchFinanceBills({
  organizationId,
}: {
  organizationId: string;
}) {
  return apiClient<{ bills: FinanceBill[] }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/finance/bills`,
  });
}

export async function fetchFinanceCategories({
  organizationId,
}: {
  organizationId: string;
}) {
  return apiClient<{ categories: FinanceCategory[]; rules: FinanceCategoryRule[] }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/finance/categories`,
  });
}

export async function fetchFinanceBudgets({
  organizationId,
  financialMonth,
}: {
  organizationId: string;
  financialMonth: string;
}) {
  return apiClient<{ budgets: FinanceBudget[] }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/finance/budgets`,
    query: { financialMonth },
  });
}

export async function upsertFinanceBudget({
  organizationId,
  categoryId,
  amount,
  financialMonth,
}: {
  organizationId: string;
  categoryId: string | null;
  amount: number;
  financialMonth: string;
}) {
  return apiClient<{ budget: FinanceBudget }>({
    method: 'POST',
    path: `/api/organizations/${organizationId}/finance/budgets`,
    body: { categoryId, amount, financialMonth },
  });
}

export async function deleteFinanceBudget({
  organizationId,
  budgetId,
}: {
  organizationId: string;
  budgetId: string;
}) {
  return apiClient({
    method: 'DELETE',
    path: `/api/organizations/${organizationId}/finance/budgets/${budgetId}`,
  });
}

export async function fetchFinanceItems({
  organizationId,
}: {
  organizationId: string;
}) {
  return apiClient<{ items: FinanceItem[] }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/finance/items`,
  });
}

export async function createFinanceItem({
  organizationId,
  pluggyItemId,
  connectorName,
}: {
  organizationId: string;
  pluggyItemId: string;
  connectorName: string;
}) {
  return apiClient<{ item: FinanceItem }>({
    method: 'POST',
    path: `/api/organizations/${organizationId}/finance/items`,
    body: { pluggyItemId, connectorName },
  });
}

export async function triggerFinanceSync({
  organizationId,
  itemId,
}: {
  organizationId: string;
  itemId?: string;
}) {
  return apiClient<{ message: string }>({
    method: 'POST',
    path: `/api/organizations/${organizationId}/finance/sync`,
    body: { ...(itemId ? { itemId } : {}) },
  });
}

export async function fetchFinanceInstallments({
  organizationId,
}: {
  organizationId: string;
}) {
  return apiClient<{ installments: FinanceTransaction[] }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/finance/installments`,
  });
}

export async function createFinanceCategoryRule({
  organizationId,
  categoryId,
  pattern,
  field,
  priority,
}: {
  organizationId: string;
  categoryId: string;
  pattern: string;
  field: string;
  priority: number;
}) {
  return apiClient<{ rule: FinanceCategoryRule }>({
    method: 'POST',
    path: `/api/organizations/${organizationId}/finance/categories/rules`,
    body: { categoryId, pattern, field, priority },
  });
}

export async function deleteFinanceCategoryRule({
  organizationId,
  ruleId,
}: {
  organizationId: string;
  ruleId: string;
}) {
  return apiClient({
    method: 'DELETE',
    path: `/api/organizations/${organizationId}/finance/categories/rules/${ruleId}`,
  });
}

export async function fetchFinanceAccounts({
  organizationId,
}: {
  organizationId: string;
}) {
  return apiClient<{ accounts: FinanceAccount[] }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/finance/accounts`,
  });
}

export async function createConnectToken({ organizationId, itemId }: {
  organizationId: string; itemId?: string;
}) {
  return apiClient<{ accessToken: string }>({
    method: 'POST',
    path: `/api/organizations/${organizationId}/finance/connect-token`,
    body: { itemId },
  });
}
