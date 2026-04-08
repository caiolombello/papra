import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { API_KEY_PERMISSIONS } from '../api-keys/api-keys.constants';
import { getUser } from '../app/auth/auth.models';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { validateJsonBody, validateParams, validateQuery } from '../shared/validation/validation';
import {
  createFinanceItemBodySchema,
  financeBudgetBodySchema,
  financeCategoryRuleBodySchema,
  syncQuerySchema,
  transactionUpdateBodySchema,
  transactionsQuerySchema,
} from './finance.schemas';
import { createFinanceRepository } from './finance.repository';
import { createPluggySyncService } from './sync/pluggy-sync.service';
import { getFinancialMonthRange } from './finance.usecases';

export function registerFinanceRoutes(context: RouteDefinitionContext) {
  const { app, db, config } = context;

  // ─── Dashboard ────────────────────────────────────────────────────────────────

  app.get(
    '/api/organizations/:organizationId/finance/dashboard',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.READ] }),
    validateParams(z.object({ organizationId: z.string() })),
    validateQuery(z.object({ financialMonth: z.string().regex(/^\d{4}-\d{2}$/).optional() })),
    async (c) => {
      const { userId } = getUser({ context: c });
      const { organizationId } = c.req.valid('param');
      const { financialMonth } = c.req.valid('query');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financeRepository = createFinanceRepository({ db });
      const startDay = config.finance.financialMonthStartDay;
      const { from, to, month } = getFinancialMonthRange({ financialMonth, startDay });

      const [
        { accounts },
        { bills: openBills },
        { summary: investmentsSummary },
        { rows: spendingByCategory },
        { budgets },
        { transactions: activeInstallments },
      ] = await Promise.all([
        financeRepository.listAccounts({ organizationId }),
        financeRepository.getOpenBills({ organizationId }),
        financeRepository.getInvestmentsSummary({ organizationId }),
        financeRepository.getSpendingByCategory({ organizationId, from, to }),
        financeRepository.getBudgets({ organizationId, financialMonth: month }),
        financeRepository.getActiveInstallments({ organizationId }),
      ]);

      const totalBalance = accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0);
      const totalOpenBills = openBills.reduce((sum, b) => sum + (b.totalAmount ?? 0), 0);
      const totalSpending = spendingByCategory.reduce((sum, r) => sum + (r.totalAmount ?? 0), 0);

      return c.json({
        month,
        from,
        to,
        accounts,
        openBills,
        investmentsSummary,
        spendingByCategory,
        budgets,
        activeInstallments,
        summary: {
          totalBalance,
          totalOpenBills,
          totalSpending,
          investmentsBalance: investmentsSummary?.totalBalance ?? 0,
        },
      });
    },
  );

  // ─── Accounts ─────────────────────────────────────────────────────────────────

  app.get(
    '/api/organizations/:organizationId/finance/accounts',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.READ] }),
    validateParams(z.object({ organizationId: z.string() })),
    async (c) => {
      const { userId } = getUser({ context: c });
      const { organizationId } = c.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financeRepository = createFinanceRepository({ db });
      const { accounts } = await financeRepository.listAccounts({ organizationId });

      return c.json({ accounts });
    },
  );

  // ─── Transactions ─────────────────────────────────────────────────────────────

  app.get(
    '/api/organizations/:organizationId/finance/transactions',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.READ] }),
    validateParams(z.object({ organizationId: z.string() })),
    validateQuery(transactionsQuerySchema),
    async (c) => {
      const { userId } = getUser({ context: c });
      const { organizationId } = c.req.valid('param');
      const query = c.req.valid('query');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financeRepository = createFinanceRepository({ db });

      let fromDate: Date | undefined;
      let toDate: Date | undefined;

      if (query.financialMonth) {
        const startDay = config.finance.financialMonthStartDay;
        const { from, to } = getFinancialMonthRange({ financialMonth: query.financialMonth, startDay });
        fromDate = from;
        toDate = to;
      } else {
        fromDate = query.from ? new Date(query.from) : undefined;
        toDate = query.to ? new Date(query.to) : undefined;
      }

      const { transactions, totalCount } = await financeRepository.listTransactions({
        organizationId,
        filters: {
          accountId: query.accountId,
          categoryId: query.categoryId,
          type: query.type,
          from: fromDate,
          to: toDate,
          search: query.search,
          offset: query.pageIndex * query.pageSize,
          limit: query.pageSize,
        },
      });

      return c.json({ transactions, totalCount, pageIndex: query.pageIndex, pageSize: query.pageSize });
    },
  );

  app.patch(
    '/api/organizations/:organizationId/finance/transactions/:transactionId',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.UPDATE] }),
    validateParams(z.object({ organizationId: z.string(), transactionId: z.string() })),
    validateJsonBody(transactionUpdateBodySchema),
    async (c) => {
      const { userId } = getUser({ context: c });
      const { organizationId, transactionId } = c.req.valid('param');
      const { categoryId } = c.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financeRepository = createFinanceRepository({ db });
      await financeRepository.updateTransactionCategory({ id: transactionId, categoryId });

      return c.json({ transactionId, categoryId });
    },
  );

  // ─── Investments ──────────────────────────────────────────────────────────────

  app.get(
    '/api/organizations/:organizationId/finance/investments',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.READ] }),
    validateParams(z.object({ organizationId: z.string() })),
    async (c) => {
      const { userId } = getUser({ context: c });
      const { organizationId } = c.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financeRepository = createFinanceRepository({ db });
      const { investments } = await financeRepository.listInvestments({ organizationId });

      return c.json({ investments });
    },
  );

  app.get(
    '/api/organizations/:organizationId/finance/investments/summary',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.READ] }),
    validateParams(z.object({ organizationId: z.string() })),
    async (c) => {
      const { userId } = getUser({ context: c });
      const { organizationId } = c.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financeRepository = createFinanceRepository({ db });
      const { summary } = await financeRepository.getInvestmentsSummary({ organizationId });

      return c.json({ summary });
    },
  );

  // ─── Bills ────────────────────────────────────────────────────────────────────

  app.get(
    '/api/organizations/:organizationId/finance/bills',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.READ] }),
    validateParams(z.object({ organizationId: z.string() })),
    async (c) => {
      const { userId } = getUser({ context: c });
      const { organizationId } = c.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financeRepository = createFinanceRepository({ db });
      const { bills } = await financeRepository.listBills({ organizationId });

      return c.json({ bills });
    },
  );

  // ─── Categories ───────────────────────────────────────────────────────────────

  app.get(
    '/api/organizations/:organizationId/finance/categories',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.READ] }),
    validateParams(z.object({ organizationId: z.string() })),
    async (c) => {
      const { userId } = getUser({ context: c });
      const { organizationId } = c.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financeRepository = createFinanceRepository({ db });
      const [{ categories }, { rules }] = await Promise.all([
        financeRepository.listCategories({ organizationId }),
        financeRepository.getCategoryRules({ organizationId }),
      ]);

      return c.json({ categories, rules });
    },
  );

  app.post(
    '/api/organizations/:organizationId/finance/categories/rules',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.CREATE] }),
    validateParams(z.object({ organizationId: z.string() })),
    validateJsonBody(financeCategoryRuleBodySchema),
    async (c) => {
      const { userId } = getUser({ context: c });
      const { organizationId } = c.req.valid('param');
      const body = c.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financeRepository = createFinanceRepository({ db });
      const { rule } = await financeRepository.createCategoryRule({
        organizationId,
        categoryId: body.categoryId,
        pattern: body.pattern,
        field: body.field,
        priority: body.priority,
      });

      return c.json({ rule }, 201);
    },
  );

  app.delete(
    '/api/organizations/:organizationId/finance/categories/rules/:ruleId',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.DELETE] }),
    validateParams(z.object({ organizationId: z.string(), ruleId: z.string() })),
    async (c) => {
      const { userId } = getUser({ context: c });
      const { organizationId, ruleId } = c.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financeRepository = createFinanceRepository({ db });
      await financeRepository.deleteCategoryRule({ id: ruleId });

      return c.body(null, 204);
    },
  );

  // ─── Budgets ──────────────────────────────────────────────────────────────────

  app.get(
    '/api/organizations/:organizationId/finance/budgets',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.READ] }),
    validateParams(z.object({ organizationId: z.string() })),
    validateQuery(z.object({ financialMonth: z.string().regex(/^\d{4}-\d{2}$/) })),
    async (c) => {
      const { userId } = getUser({ context: c });
      const { organizationId } = c.req.valid('param');
      const { financialMonth } = c.req.valid('query');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financeRepository = createFinanceRepository({ db });
      const { budgets } = await financeRepository.getBudgets({ organizationId, financialMonth });

      return c.json({ budgets });
    },
  );

  app.post(
    '/api/organizations/:organizationId/finance/budgets',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.CREATE] }),
    validateParams(z.object({ organizationId: z.string() })),
    validateJsonBody(financeBudgetBodySchema),
    async (c) => {
      const { userId } = getUser({ context: c });
      const { organizationId } = c.req.valid('param');
      const body = c.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financeRepository = createFinanceRepository({ db });
      const { budget } = await financeRepository.upsertBudget({
        organizationId,
        categoryId: body.categoryId,
        amount: body.amount,
        financialMonth: body.financialMonth,
      });

      return c.json({ budget }, 201);
    },
  );

  app.delete(
    '/api/organizations/:organizationId/finance/budgets/:budgetId',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.DELETE] }),
    validateParams(z.object({ organizationId: z.string(), budgetId: z.string() })),
    async (c) => {
      const { userId } = getUser({ context: c });
      const { organizationId, budgetId } = c.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financeRepository = createFinanceRepository({ db });
      await financeRepository.deleteBudget({ id: budgetId });

      return c.body(null, 204);
    },
  );

  // ─── Items ────────────────────────────────────────────────────────────────────

  app.post(
    '/api/organizations/:organizationId/finance/items',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.CREATE] }),
    validateParams(z.object({ organizationId: z.string() })),
    validateJsonBody(createFinanceItemBodySchema),
    async (c) => {
      const { userId } = getUser({ context: c });
      const { organizationId } = c.req.valid('param');
      const body = c.req.valid('json');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financeRepository = createFinanceRepository({ db });
      const { item } = await financeRepository.createItem({
        organizationId,
        pluggyItemId: body.pluggyItemId,
        connectorName: body.connectorName,
      });

      return c.json({ item }, 201);
    },
  );

  app.get(
    '/api/organizations/:organizationId/finance/items',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.READ] }),
    validateParams(z.object({ organizationId: z.string() })),
    async (c) => {
      const { userId } = getUser({ context: c });
      const { organizationId } = c.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financeRepository = createFinanceRepository({ db });
      const { items } = await financeRepository.listItems({ organizationId });

      return c.json({ items });
    },
  );

  // ─── Sync ─────────────────────────────────────────────────────────────────────

  app.post(
    '/api/organizations/:organizationId/finance/sync',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.CREATE] }),
    validateParams(z.object({ organizationId: z.string() })),
    validateQuery(syncQuerySchema),
    async (c) => {
      const { userId } = getUser({ context: c });
      const { organizationId } = c.req.valid('param');
      const { itemId } = c.req.valid('query');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financeRepository = createFinanceRepository({ db });
      const syncService = createPluggySyncService({ config, db, financeRepository });

      if (itemId) {
        await syncService.syncItem({ itemId, organizationId });
      } else {
        await syncService.syncAllItems({ organizationId });
      }

      return c.json({ message: 'Sync completed' });
    },
  );

  // ─── Installments ─────────────────────────────────────────────────────────────

  app.get(
    '/api/organizations/:organizationId/finance/installments',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.READ] }),
    validateParams(z.object({ organizationId: z.string() })),
    async (c) => {
      const { userId } = getUser({ context: c });
      const { organizationId } = c.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const financeRepository = createFinanceRepository({ db });
      const { transactions: installments } = await financeRepository.getActiveInstallments({ organizationId });

      return c.json({ installments });
    },
  );
}
