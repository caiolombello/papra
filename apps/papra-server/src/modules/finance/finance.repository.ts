import type { Database } from '../app/database/database.types';
import { injectArguments } from '@corentinth/chisels';
import { and, desc, eq, gte, isNotNull, like, lte, lt, sql } from 'drizzle-orm';
import {
  financeItemsTable,
  financeAccountsTable,
  financeTransactionsTable,
  financeBillsTable,
  financeInvestmentsTable,
  financeCategoriesTable,
  financeCategoryRulesTable,
  financeBudgetsTable,
  financeSyncLogTable,
} from './finance.tables';

export type FinanceRepository = ReturnType<typeof createFinanceRepository>;

export function createFinanceRepository({ db }: { db: Database }) {
  return injectArguments({
    // Items
    createItem,
    listItems,
    getItemByPluggyId,
    updateItemSyncStatus,
    // Accounts
    upsertAccount,
    listAccounts,
    getAccountById,
    getCreditCardAccounts,
    // Transactions
    upsertTransaction,
    listTransactions,
    getTransactionById,
    updateTransactionCategory,
    getActiveInstallments,
    getSpendingByCategory,
    // Bills
    upsertBill,
    listBills,
    getOpenBills,
    // Investments
    upsertInvestment,
    listInvestments,
    getInvestmentsSummary,
    // Categories
    upsertCategory,
    listCategories,
    getCategoryRules,
    createCategoryRule,
    deleteCategoryRule,
    // Budgets
    upsertBudget,
    getBudgets,
    deleteBudget,
    // Items (delete)
    deleteItem,
    // Sync Log
    createSyncLog,
    getLastSync,
  }, { db });
}

// ─── Items ────────────────────────────────────────────────────────────────────

async function createItem({
  organizationId,
  pluggyItemId,
  connectorName,
  db,
}: {
  organizationId: string;
  pluggyItemId: string;
  connectorName: string;
  db: Database;
}) {
  const [item] = await db
    .insert(financeItemsTable)
    .values({ organizationId, pluggyItemId, connectorName })
    .returning();

  if (!item) {
    throw new Error('Failed to create finance item');
  }

  return { item };
}

async function listItems({
  organizationId,
  db,
}: {
  organizationId: string;
  db: Database;
}) {
  const items = await db
    .select()
    .from(financeItemsTable)
    .where(eq(financeItemsTable.organizationId, organizationId));

  return { items };
}

async function getItemByPluggyId({
  organizationId,
  pluggyItemId,
  db,
}: {
  organizationId: string;
  pluggyItemId: string;
  db: Database;
}) {
  const [item] = await db
    .select()
    .from(financeItemsTable)
    .where(and(
      eq(financeItemsTable.organizationId, organizationId),
      eq(financeItemsTable.pluggyItemId, pluggyItemId),
    ));

  return { item: item ?? null };
}

async function updateItemSyncStatus({
  id,
  status,
  lastSyncAt,
  db,
}: {
  id: string;
  status: string;
  lastSyncAt?: Date;
  db: Database;
}) {
  await db
    .update(financeItemsTable)
    .set({
      status,
      ...(lastSyncAt !== undefined && { lastSyncAt }),
      updatedAt: new Date(),
    })
    .where(eq(financeItemsTable.id, id));
}

async function deleteItem({ id, db }: { id: string; db: Database }) {
  await db.delete(financeItemsTable).where(eq(financeItemsTable.id, id));
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

async function upsertAccount({
  itemId,
  organizationId,
  account,
  db,
}: {
  itemId: string;
  organizationId: string;
  account: {
    pluggyAccountId: string;
    type: string;
    subtype?: string | null;
    name: string;
    balance: number;
    currencyCode?: string | null;
    creditLimit?: number | null;
    availableCreditLimit?: number | null;
    closingDay?: number | null;
    dueDay?: number | null;
  };
  db: Database;
}) {
  const [upserted] = await db
    .insert(financeAccountsTable)
    .values({
      itemId,
      organizationId,
      pluggyAccountId: account.pluggyAccountId,
      type: account.type,
      subtype: account.subtype ?? null,
      name: account.name,
      balance: account.balance,
      currencyCode: account.currencyCode ?? null,
      creditLimit: account.creditLimit ?? null,
      availableCreditLimit: account.availableCreditLimit ?? null,
      closingDay: account.closingDay ?? null,
      dueDay: account.dueDay ?? null,
    })
    .onConflictDoUpdate({
      target: [financeAccountsTable.organizationId, financeAccountsTable.pluggyAccountId],
      set: {
        itemId,
        type: account.type,
        subtype: account.subtype ?? null,
        name: account.name,
        balance: account.balance,
        currencyCode: account.currencyCode ?? null,
        creditLimit: account.creditLimit ?? null,
        availableCreditLimit: account.availableCreditLimit ?? null,
        closingDay: account.closingDay ?? null,
        dueDay: account.dueDay ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!upserted) {
    throw new Error('Failed to upsert finance account');
  }

  return { account: upserted };
}

async function listAccounts({
  organizationId,
  db,
}: {
  organizationId: string;
  db: Database;
}) {
  const accounts = await db
    .select()
    .from(financeAccountsTable)
    .where(eq(financeAccountsTable.organizationId, organizationId));

  return { accounts };
}

async function getAccountById({
  id,
  db,
}: {
  id: string;
  db: Database;
}) {
  const [account] = await db
    .select()
    .from(financeAccountsTable)
    .where(eq(financeAccountsTable.id, id));

  return { account: account ?? null };
}

async function getCreditCardAccounts({
  organizationId,
  db,
}: {
  organizationId: string;
  db: Database;
}) {
  const accounts = await db
    .select()
    .from(financeAccountsTable)
    .where(and(
      eq(financeAccountsTable.organizationId, organizationId),
      eq(financeAccountsTable.type, 'CREDIT'),
    ));

  return { accounts };
}

// ─── Transactions ─────────────────────────────────────────────────────────────

async function upsertTransaction({
  accountId,
  organizationId,
  transaction,
  db,
}: {
  accountId: string;
  organizationId: string;
  transaction: {
    pluggyTransactionId: string;
    description: string;
    amount: number;
    date: Date;
    type: string;
    status?: string;
    categoryId?: string | null;
    pluggyCategoryId?: string | null;
    installmentNumber?: number | null;
    totalInstallments?: number | null;
    totalAmount?: number | null;
    purchaseDate?: Date | null;
    billId?: string | null;
    merchantName?: string | null;
    merchantCnpj?: string | null;
    paymentMethod?: string | null;
  };
  db: Database;
}) {
  const [upserted] = await db
    .insert(financeTransactionsTable)
    .values({
      accountId,
      organizationId,
      pluggyTransactionId: transaction.pluggyTransactionId,
      description: transaction.description,
      amount: transaction.amount,
      date: transaction.date,
      type: transaction.type,
      status: transaction.status ?? 'POSTED',
      categoryId: transaction.categoryId ?? null,
      pluggyCategoryId: transaction.pluggyCategoryId ?? null,
      installmentNumber: transaction.installmentNumber ?? null,
      totalInstallments: transaction.totalInstallments ?? null,
      totalAmount: transaction.totalAmount ?? null,
      purchaseDate: transaction.purchaseDate ?? null,
      billId: transaction.billId ?? null,
      merchantName: transaction.merchantName ?? null,
      merchantCnpj: transaction.merchantCnpj ?? null,
      paymentMethod: transaction.paymentMethod ?? null,
    })
    .onConflictDoUpdate({
      target: [financeTransactionsTable.organizationId, financeTransactionsTable.pluggyTransactionId],
      set: {
        accountId,
        description: transaction.description,
        amount: transaction.amount,
        date: transaction.date,
        type: transaction.type,
        status: transaction.status ?? 'POSTED',
        categoryId: transaction.categoryId ?? null,
        pluggyCategoryId: transaction.pluggyCategoryId ?? null,
        installmentNumber: transaction.installmentNumber ?? null,
        totalInstallments: transaction.totalInstallments ?? null,
        totalAmount: transaction.totalAmount ?? null,
        purchaseDate: transaction.purchaseDate ?? null,
        billId: transaction.billId ?? null,
        merchantName: transaction.merchantName ?? null,
        merchantCnpj: transaction.merchantCnpj ?? null,
        paymentMethod: transaction.paymentMethod ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!upserted) {
    throw new Error('Failed to upsert finance transaction');
  }

  return { transaction: upserted };
}

async function listTransactions({
  organizationId,
  filters,
  db,
}: {
  organizationId: string;
  filters: {
    accountId?: string;
    categoryId?: string;
    type?: string;
    from?: Date;
    to?: Date;
    search?: string;
    offset: number;
    limit: number;
  };
  db: Database;
}) {
  const conditions = [eq(financeTransactionsTable.organizationId, organizationId)];

  if (filters.accountId) {
    conditions.push(eq(financeTransactionsTable.accountId, filters.accountId));
  }

  if (filters.categoryId) {
    conditions.push(eq(financeTransactionsTable.categoryId, filters.categoryId));
  }

  if (filters.type) {
    conditions.push(eq(financeTransactionsTable.type, filters.type));
  }

  if (filters.from) {
    conditions.push(gte(financeTransactionsTable.date, filters.from));
  }

  if (filters.to) {
    conditions.push(lte(financeTransactionsTable.date, filters.to));
  }

  if (filters.search) {
    conditions.push(like(financeTransactionsTable.description, `%${filters.search}%`));
  }

  const where = and(...conditions);

  const [transactions, countResult] = await Promise.all([
    db
      .select()
      .from(financeTransactionsTable)
      .where(where)
      .orderBy(desc(financeTransactionsTable.date))
      .limit(filters.limit)
      .offset(filters.offset),
    db
      .select({ count: sql<number>`COUNT(${financeTransactionsTable.id})` })
      .from(financeTransactionsTable)
      .where(where),
  ]);

  return {
    transactions,
    totalCount: countResult[0]?.count ?? 0,
  };
}

async function getTransactionById({
  id,
  db,
}: {
  id: string;
  db: Database;
}) {
  const [transaction] = await db
    .select()
    .from(financeTransactionsTable)
    .where(eq(financeTransactionsTable.id, id));

  return { transaction: transaction ?? null };
}

async function updateTransactionCategory({
  id,
  categoryId,
  db,
}: {
  id: string;
  categoryId: string | null;
  db: Database;
}) {
  await db
    .update(financeTransactionsTable)
    .set({ categoryId, updatedAt: new Date() })
    .where(eq(financeTransactionsTable.id, id));
}

async function getActiveInstallments({
  organizationId,
  db,
}: {
  organizationId: string;
  db: Database;
}) {
  const transactions = await db
    .select()
    .from(financeTransactionsTable)
    .where(and(
      eq(financeTransactionsTable.organizationId, organizationId),
      isNotNull(financeTransactionsTable.totalInstallments),
      lt(financeTransactionsTable.installmentNumber, financeTransactionsTable.totalInstallments),
    ));

  return { transactions };
}

async function getSpendingByCategory({
  organizationId,
  from,
  to,
  db,
}: {
  organizationId: string;
  from: Date;
  to: Date;
  db: Database;
}) {
  const rows = await db
    .select({
      categoryId: financeTransactionsTable.categoryId,
      totalAmount: sql<number>`SUM(ABS(${financeTransactionsTable.amount}))`,
      count: sql<number>`COUNT(${financeTransactionsTable.id})`,
    })
    .from(financeTransactionsTable)
    .where(and(
      eq(financeTransactionsTable.organizationId, organizationId),
      eq(financeTransactionsTable.type, 'DEBIT'),
      gte(financeTransactionsTable.date, from),
      lte(financeTransactionsTable.date, to),
    ))
    .groupBy(financeTransactionsTable.categoryId);

  return { rows };
}

// ─── Bills ────────────────────────────────────────────────────────────────────

async function upsertBill({
  accountId,
  organizationId,
  bill,
  db,
}: {
  accountId: string;
  organizationId: string;
  bill: {
    pluggyBillId: string;
    dueDate: Date;
    totalAmount: number;
    minimumPayment?: number | null;
    status?: string | null;
  };
  db: Database;
}) {
  const [upserted] = await db
    .insert(financeBillsTable)
    .values({
      accountId,
      organizationId,
      pluggyBillId: bill.pluggyBillId,
      dueDate: bill.dueDate,
      totalAmount: bill.totalAmount,
      minimumPayment: bill.minimumPayment ?? null,
      status: bill.status ?? 'OPEN',
    })
    .onConflictDoUpdate({
      target: [financeBillsTable.organizationId, financeBillsTable.pluggyBillId],
      set: {
        accountId,
        dueDate: bill.dueDate,
        totalAmount: bill.totalAmount,
        minimumPayment: bill.minimumPayment ?? null,
        status: bill.status ?? 'OPEN',
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!upserted) {
    throw new Error('Failed to upsert finance bill');
  }

  return { bill: upserted };
}

async function listBills({
  organizationId,
  db,
}: {
  organizationId: string;
  db: Database;
}) {
  const bills = await db
    .select()
    .from(financeBillsTable)
    .where(eq(financeBillsTable.organizationId, organizationId))
    .orderBy(desc(financeBillsTable.dueDate));

  return { bills };
}

async function getOpenBills({
  organizationId,
  db,
}: {
  organizationId: string;
  db: Database;
}) {
  const bills = await db
    .select()
    .from(financeBillsTable)
    .where(and(
      eq(financeBillsTable.organizationId, organizationId),
      eq(financeBillsTable.status, 'OPEN'),
    ));

  return { bills };
}

// ─── Investments ──────────────────────────────────────────────────────────────

async function upsertInvestment({
  itemId,
  organizationId,
  investment,
  db,
}: {
  itemId: string;
  organizationId: string;
  investment: {
    pluggyInvestmentId: string;
    name: string;
    type?: string | null;
    subtype?: string | null;
    code?: string | null;
    balance: number;
    amount?: number | null;
    amountOriginal?: number | null;
    amountProfit?: number | null;
    lastMonthRate?: number | null;
    lastTwelveMonthsRate?: number | null;
    annualRate?: number | null;
    currencyCode?: string | null;
    dueDate?: Date | null;
    quantity?: number | null;
    value?: number | null;
  };
  db: Database;
}) {
  const [upserted] = await db
    .insert(financeInvestmentsTable)
    .values({
      itemId,
      organizationId,
      pluggyInvestmentId: investment.pluggyInvestmentId,
      name: investment.name,
      type: investment.type ?? null,
      subtype: investment.subtype ?? null,
      code: investment.code ?? null,
      balance: investment.balance,
      amount: investment.amount ?? null,
      amountOriginal: investment.amountOriginal ?? null,
      amountProfit: investment.amountProfit ?? null,
      lastMonthRate: investment.lastMonthRate ?? null,
      lastTwelveMonthsRate: investment.lastTwelveMonthsRate ?? null,
      annualRate: investment.annualRate ?? null,
      currencyCode: investment.currencyCode ?? null,
      dueDate: investment.dueDate ?? null,
      quantity: investment.quantity ?? null,
      value: investment.value ?? null,
    })
    .onConflictDoUpdate({
      target: [financeInvestmentsTable.organizationId, financeInvestmentsTable.pluggyInvestmentId],
      set: {
        itemId,
        name: investment.name,
        type: investment.type ?? null,
        subtype: investment.subtype ?? null,
        code: investment.code ?? null,
        balance: investment.balance,
        amount: investment.amount ?? null,
        amountOriginal: investment.amountOriginal ?? null,
        amountProfit: investment.amountProfit ?? null,
        lastMonthRate: investment.lastMonthRate ?? null,
        lastTwelveMonthsRate: investment.lastTwelveMonthsRate ?? null,
        annualRate: investment.annualRate ?? null,
        currencyCode: investment.currencyCode ?? null,
        dueDate: investment.dueDate ?? null,
        quantity: investment.quantity ?? null,
        value: investment.value ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!upserted) {
    throw new Error('Failed to upsert finance investment');
  }

  return { investment: upserted };
}

async function listInvestments({
  organizationId,
  db,
}: {
  organizationId: string;
  db: Database;
}) {
  const investments = await db
    .select()
    .from(financeInvestmentsTable)
    .where(eq(financeInvestmentsTable.organizationId, organizationId));

  return { investments };
}

async function getInvestmentsSummary({
  organizationId,
  db,
}: {
  organizationId: string;
  db: Database;
}) {
  const [summary] = await db
    .select({
      totalBalance: sql<number>`SUM(${financeInvestmentsTable.balance})`,
      totalProfit: sql<number>`SUM(${financeInvestmentsTable.amountProfit})`,
      avgLastMonthRate: sql<number>`AVG(${financeInvestmentsTable.lastMonthRate})`,
      count: sql<number>`COUNT(${financeInvestmentsTable.id})`,
    })
    .from(financeInvestmentsTable)
    .where(eq(financeInvestmentsTable.organizationId, organizationId));

  return { summary: summary ?? null };
}

// ─── Categories ───────────────────────────────────────────────────────────────

async function upsertCategory({
  organizationId,
  pluggyCategoryId,
  name,
  parentId,
  isCustom,
  db,
}: {
  organizationId: string;
  pluggyCategoryId?: string | null;
  name: string;
  parentId?: string | null;
  isCustom?: boolean;
  db: Database;
}) {
  if (pluggyCategoryId) {
    const [existing] = await db
      .select()
      .from(financeCategoriesTable)
      .where(and(
        eq(financeCategoriesTable.organizationId, organizationId),
        eq(financeCategoriesTable.pluggyCategoryId, pluggyCategoryId),
      ));

    if (existing) {
      return { category: existing };
    }
  }

  const [category] = await db
    .insert(financeCategoriesTable)
    .values({
      organizationId,
      pluggyCategoryId: pluggyCategoryId ?? null,
      name,
      parentId: parentId ?? null,
      isCustom: isCustom ? 1 : 0,
    })
    .returning();

  if (!category) {
    throw new Error('Failed to upsert finance category');
  }

  return { category };
}

async function listCategories({
  organizationId,
  db,
}: {
  organizationId: string;
  db: Database;
}) {
  const categories = await db
    .select()
    .from(financeCategoriesTable)
    .where(eq(financeCategoriesTable.organizationId, organizationId));

  return { categories };
}

async function getCategoryRules({
  organizationId,
  db,
}: {
  organizationId: string;
  db: Database;
}) {
  const rules = await db
    .select()
    .from(financeCategoryRulesTable)
    .where(eq(financeCategoryRulesTable.organizationId, organizationId))
    .orderBy(desc(financeCategoryRulesTable.priority));

  return { rules };
}

async function createCategoryRule({
  organizationId,
  categoryId,
  pattern,
  field,
  priority,
  db,
}: {
  organizationId: string;
  categoryId: string;
  pattern: string;
  field: string;
  priority: number;
  db: Database;
}) {
  const [rule] = await db
    .insert(financeCategoryRulesTable)
    .values({ organizationId, categoryId, pattern, field, priority })
    .returning();

  if (!rule) {
    throw new Error('Failed to create category rule');
  }

  return { rule };
}

async function deleteCategoryRule({
  id,
  db,
}: {
  id: string;
  db: Database;
}) {
  await db
    .delete(financeCategoryRulesTable)
    .where(eq(financeCategoryRulesTable.id, id));
}

// ─── Budgets ──────────────────────────────────────────────────────────────────

async function upsertBudget({
  organizationId,
  categoryId,
  amount,
  financialMonth,
  db,
}: {
  organizationId: string;
  categoryId: string | null;
  amount: number;
  financialMonth: string;
  db: Database;
}) {
  const [budget] = await db
    .insert(financeBudgetsTable)
    .values({ organizationId, categoryId, amount, financialMonth })
    .onConflictDoUpdate({
      target: [financeBudgetsTable.organizationId, financeBudgetsTable.categoryId, financeBudgetsTable.financialMonth],
      set: { amount, updatedAt: new Date() },
    })
    .returning();

  if (!budget) {
    throw new Error('Failed to upsert budget');
  }

  return { budget };
}

async function getBudgets({
  organizationId,
  financialMonth,
  db,
}: {
  organizationId: string;
  financialMonth: string;
  db: Database;
}) {
  const budgets = await db
    .select()
    .from(financeBudgetsTable)
    .where(and(
      eq(financeBudgetsTable.organizationId, organizationId),
      eq(financeBudgetsTable.financialMonth, financialMonth),
    ));

  return { budgets };
}

async function deleteBudget({
  id,
  db,
}: {
  id: string;
  db: Database;
}) {
  await db
    .delete(financeBudgetsTable)
    .where(eq(financeBudgetsTable.id, id));
}

// ─── Sync Log ─────────────────────────────────────────────────────────────────

async function createSyncLog({
  itemId,
  organizationId,
  status,
  transactionsCount,
  error,
  db,
}: {
  itemId: string;
  organizationId: string;
  status: string;
  transactionsCount?: number | null;
  error?: string | null;
  db: Database;
}) {
  const [log] = await db
    .insert(financeSyncLogTable)
    .values({
      itemId,
      organizationId,
      status,
      transactionsCount: transactionsCount ?? 0,
      error: error ?? null,
    })
    .returning();

  if (!log) {
    throw new Error('Failed to create sync log');
  }

  return { log };
}

async function getLastSync({
  itemId,
  db,
}: {
  itemId: string;
  db: Database;
}) {
  const [log] = await db
    .select()
    .from(financeSyncLogTable)
    .where(eq(financeSyncLogTable.itemId, itemId))
    .orderBy(desc(financeSyncLogTable.syncedAt))
    .limit(1);

  return { log: log ?? null };
}
