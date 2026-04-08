import type { financeItemsTable, financeAccountsTable, financeTransactionsTable, financeBillsTable, financeInvestmentsTable, financeCategoriesTable, financeCategoryRulesTable, financeBudgetsTable, financeSyncLogTable } from './finance.tables';

export type DbFinanceItem = typeof financeItemsTable.$inferSelect;
export type DbFinanceAccount = typeof financeAccountsTable.$inferSelect;
export type DbFinanceTransaction = typeof financeTransactionsTable.$inferSelect;
export type DbFinanceBill = typeof financeBillsTable.$inferSelect;
export type DbFinanceInvestment = typeof financeInvestmentsTable.$inferSelect;
export type DbFinanceCategory = typeof financeCategoriesTable.$inferSelect;
export type DbFinanceCategoryRule = typeof financeCategoryRulesTable.$inferSelect;
export type DbFinanceBudget = typeof financeBudgetsTable.$inferSelect;
export type DbFinanceSyncLog = typeof financeSyncLogTable.$inferSelect;

export type FinanceItemForCreation = {
  pluggyItemId: string;
  connectorName: string;
};

export type FinanceAccountForUpsert = {
  pluggyAccountId: string;
  type: string;
  subtype?: string | null;
  name: string;
  balance: number;
  currencyCode?: string;
  creditLimit?: number | null;
  availableCreditLimit?: number | null;
  closingDay?: number | null;
  dueDay?: number | null;
};

export type FinanceTransactionForUpsert = {
  pluggyTransactionId: string;
  description: string;
  amount: number;
  date: Date;
  type: string;
  status: string;
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

export type FinanceBillForUpsert = {
  pluggyBillId: string;
  dueDate: Date;
  totalAmount: number;
  minimumPayment?: number | null;
  status?: string;
};

export type FinanceInvestmentForUpsert = {
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
  currencyCode?: string;
  dueDate?: Date | null;
  quantity?: number | null;
  value?: number | null;
};

export type FinanceDashboardSummary = {
  totalBankBalance: number;
  totalOpenBills: number;
  totalInvestments: number;
  investmentMonthlyRate: number;
  budgetUsed: number;
  budgetTotal: number;
  activeInstallments: Array<{
    description: string;
    installmentNumber: number;
    totalInstallments: number;
    monthlyAmount: number;
    endDate: Date;
  }>;
  upcomingEvents: Array<{
    date: Date;
    type: 'closing' | 'due' | 'salary' | 'payment';
    description: string;
    accountName?: string;
  }>;
};
