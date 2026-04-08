import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import {
  generateFinanceItemId,
  generateFinanceAccountId,
  generateFinanceTransactionId,
  generateFinanceBillId,
  generateFinanceInvestmentId,
  generateFinanceCategoryId,
  generateFinanceCategoryRuleId,
  generateFinanceBudgetId,
  generateFinanceSyncLogId,
} from './finance.models';

export const financeItemsTable = sqliteTable('finance_items', {
  ...createPrimaryKeyField({ idGenerator: generateFinanceItemId }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade' }),
  pluggyItemId: text('pluggy_item_id').notNull(),
  connectorName: text('connector_name').notNull(),
  status: text('status').notNull().default('UPDATED'),
  lastSyncAt: integer('last_sync_at', { mode: 'timestamp_ms' }),
}, table => [
  uniqueIndex('finance_items_org_pluggy_item_unique').on(table.organizationId, table.pluggyItemId),
]);

export const financeAccountsTable = sqliteTable('finance_accounts', {
  ...createPrimaryKeyField({ idGenerator: generateFinanceAccountId }),
  ...createTimestampColumns(),
  itemId: text('item_id').notNull().references(() => financeItemsTable.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade' }),
  pluggyAccountId: text('pluggy_account_id').notNull(),
  type: text('type').notNull(),
  subtype: text('subtype'),
  name: text('name').notNull(),
  balance: real('balance').notNull().default(0),
  currencyCode: text('currency_code').default('BRL'),
  creditLimit: real('credit_limit'),
  availableCreditLimit: real('available_credit_limit'),
  closingDay: integer('closing_day'),
  dueDay: integer('due_day'),
}, table => [
  uniqueIndex('finance_accounts_org_pluggy_acc_unique').on(table.organizationId, table.pluggyAccountId),
  index('finance_accounts_org_type_index').on(table.organizationId, table.type),
]);

export const financeCategoriesTable = sqliteTable('finance_categories', {
  ...createPrimaryKeyField({ idGenerator: generateFinanceCategoryId }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade' }),
  pluggyCategoryId: text('pluggy_category_id'),
  name: text('name').notNull(),
  parentId: text('parent_id'),
  isCustom: integer('is_custom').notNull().default(0),
}, table => [
  index('finance_categories_org_index').on(table.organizationId),
]);

export const financeTransactionsTable = sqliteTable('finance_transactions', {
  ...createPrimaryKeyField({ idGenerator: generateFinanceTransactionId }),
  ...createTimestampColumns(),
  accountId: text('account_id').notNull().references(() => financeAccountsTable.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade' }),
  pluggyTransactionId: text('pluggy_transaction_id').notNull(),
  description: text('description').notNull(),
  amount: real('amount').notNull(),
  date: integer('date', { mode: 'timestamp_ms' }).notNull(),
  type: text('type').notNull(),
  status: text('status').notNull().default('POSTED'),
  categoryId: text('category_id').references(() => financeCategoriesTable.id, { onDelete: 'set null' }),
  pluggyCategoryId: text('pluggy_category_id'),
  installmentNumber: integer('installment_number'),
  totalInstallments: integer('total_installments'),
  totalAmount: real('total_amount'),
  purchaseDate: integer('purchase_date', { mode: 'timestamp_ms' }),
  billId: text('bill_id'),
  merchantName: text('merchant_name'),
  merchantCnpj: text('merchant_cnpj'),
  paymentMethod: text('payment_method'),
}, table => [
  uniqueIndex('finance_txn_org_pluggy_txn_unique').on(table.organizationId, table.pluggyTransactionId),
  index('finance_txn_org_date_index').on(table.organizationId, table.date),
  index('finance_txn_account_date_index').on(table.accountId, table.date),
  index('finance_txn_org_category_index').on(table.organizationId, table.categoryId),
]);

export const financeBillsTable = sqliteTable('finance_bills', {
  ...createPrimaryKeyField({ idGenerator: generateFinanceBillId }),
  ...createTimestampColumns(),
  accountId: text('account_id').notNull().references(() => financeAccountsTable.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade' }),
  pluggyBillId: text('pluggy_bill_id').notNull(),
  dueDate: integer('due_date', { mode: 'timestamp_ms' }).notNull(),
  totalAmount: real('total_amount').notNull(),
  minimumPayment: real('minimum_payment'),
  status: text('status').notNull().default('OPEN'),
}, table => [
  uniqueIndex('finance_bills_org_pluggy_bill_unique').on(table.organizationId, table.pluggyBillId),
  index('finance_bills_account_due_index').on(table.accountId, table.dueDate),
]);

export const financeInvestmentsTable = sqliteTable('finance_investments', {
  ...createPrimaryKeyField({ idGenerator: generateFinanceInvestmentId }),
  ...createTimestampColumns(),
  itemId: text('item_id').notNull().references(() => financeItemsTable.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade' }),
  pluggyInvestmentId: text('pluggy_investment_id').notNull(),
  name: text('name').notNull(),
  type: text('type'),
  subtype: text('subtype'),
  code: text('code'),
  balance: real('balance').notNull().default(0),
  amount: real('amount'),
  amountOriginal: real('amount_original'),
  amountProfit: real('amount_profit'),
  lastMonthRate: real('last_month_rate'),
  lastTwelveMonthsRate: real('last_twelve_months_rate'),
  annualRate: real('annual_rate'),
  currencyCode: text('currency_code').default('BRL'),
  dueDate: integer('due_date', { mode: 'timestamp_ms' }),
  quantity: real('quantity'),
  value: real('value'),
}, table => [
  uniqueIndex('finance_inv_org_pluggy_inv_unique').on(table.organizationId, table.pluggyInvestmentId),
  index('finance_inv_org_type_index').on(table.organizationId, table.type),
]);

export const financeCategoryRulesTable = sqliteTable('finance_category_rules', {
  ...createPrimaryKeyField({ idGenerator: generateFinanceCategoryRuleId }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade' }),
  categoryId: text('category_id').notNull().references(() => financeCategoriesTable.id, { onDelete: 'cascade' }),
  pattern: text('pattern').notNull(),
  field: text('field').notNull().default('description'),
  priority: integer('priority').notNull().default(0),
}, table => [
  index('finance_cat_rules_org_priority_index').on(table.organizationId, table.priority),
]);

export const financeBudgetsTable = sqliteTable('finance_budgets', {
  ...createPrimaryKeyField({ idGenerator: generateFinanceBudgetId }),
  ...createTimestampColumns(),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade' }),
  categoryId: text('category_id').references(() => financeCategoriesTable.id, { onDelete: 'cascade' }),
  amount: real('amount').notNull(),
  financialMonth: text('financial_month').notNull(),
}, table => [
  uniqueIndex('finance_budgets_org_cat_month_unique').on(table.organizationId, table.categoryId, table.financialMonth),
]);

export const financeSyncLogTable = sqliteTable('finance_sync_log', {
  ...createPrimaryKeyField({ idGenerator: generateFinanceSyncLogId }),
  itemId: text('item_id').notNull().references(() => financeItemsTable.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade' }),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }).notNull().$default(() => new Date()),
  status: text('status').notNull(),
  transactionsCount: integer('transactions_count').default(0),
  error: text('error'),
}, table => [
  index('finance_sync_log_item_synced_index').on(table.itemId, table.syncedAt),
]);
