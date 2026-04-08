import { z } from 'zod';

export const organizationIdSchema = z.object({
  organizationId: z.string().min(1),
});

export const financeItemIdSchema = z.object({
  itemId: z.string().min(1),
});

export const createFinanceItemBodySchema = z.object({
  pluggyItemId: z.string().uuid(),
  connectorName: z.string().min(1),
});

export const financeCategoryRuleBodySchema = z.object({
  categoryId: z.string().min(1),
  pattern: z.string().min(1),
  field: z.enum(['description', 'merchantName']).default('description'),
  priority: z.number().int().min(0).default(0),
});

export const financeBudgetBodySchema = z.object({
  categoryId: z.string().nullable().default(null),
  amount: z.number().positive(),
  financialMonth: z.string().regex(/^\d{4}-\d{2}$/),
});

export const transactionUpdateBodySchema = z.object({
  categoryId: z.string().nullable(),
});

export const syncQuerySchema = z.object({
  itemId: z.string().optional(),
});

export const transactionsQuerySchema = z.object({
  pageIndex: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  type: z.enum(['DEBIT', 'CREDIT']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().optional(),
  financialMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export const investmentsQuerySchema = z.object({
  pageIndex: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
