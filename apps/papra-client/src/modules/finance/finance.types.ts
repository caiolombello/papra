export type FinanceAccount = {
  id: string;
  itemId: string;
  pluggyAccountId: string;
  type: 'BANK' | 'CREDIT';
  subtype: string | null;
  name: string;
  balance: number;
  currencyCode: string;
  creditLimit: number | null;
  availableCreditLimit: number | null;
  closingDay: number | null;
  dueDay: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FinanceTransaction = {
  id: string;
  accountId: string;
  pluggyTransactionId: string;
  description: string;
  amount: number;
  date: Date;
  type: 'DEBIT' | 'CREDIT';
  status: string;
  categoryId: string | null;
  pluggyCategoryId: string | null;
  installmentNumber: number | null;
  totalInstallments: number | null;
  totalAmount: number | null;
  purchaseDate: Date | null;
  merchantName: string | null;
  paymentMethod: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FinanceBill = {
  id: string;
  accountId: string;
  pluggyBillId: string;
  dueDate: Date;
  totalAmount: number;
  minimumPayment: number | null;
  status: string;
};

export type FinanceInvestment = {
  id: string;
  pluggyInvestmentId: string;
  name: string;
  type: string | null;
  subtype: string | null;
  code: string | null;
  balance: number;
  amount: number | null;
  amountOriginal: number | null;
  amountProfit: number | null;
  lastMonthRate: number | null;
  lastTwelveMonthsRate: number | null;
  annualRate: number | null;
  currencyCode: string;
  dueDate: Date | null;
  quantity: number | null;
  value: number | null;
};

export type FinanceCategory = {
  id: string;
  pluggyCategoryId: string | null;
  name: string;
  parentId: string | null;
  isCustom: number;
};

export type FinanceBudget = {
  id: string;
  categoryId: string | null;
  amount: number;
  financialMonth: string;
};

export type FinanceCategoryRule = {
  id: string;
  categoryId: string;
  pattern: string;
  field: string;
  priority: number;
};

export type FinanceItem = {
  id: string;
  pluggyItemId: string;
  connectorName: string;
  status: string;
  lastSyncAt: Date | null;
};

export type FinanceDashboard = {
  financialMonth: string;
  from: string;
  to: string;
  totalBankBalance: number;
  totalOpenBills: number;
  investmentsSummary: {
    totalBalance: number;
    totalProfit: number;
    avgMonthlyRate: number;
    count: number;
  };
  spending: Array<{ categoryId: string | null; total: number; count: number }>;
  budgets: FinanceBudget[];
  accounts: FinanceAccount[];
  openBills: FinanceBill[];
  activeInstallments: FinanceTransaction[];
  creditCards: FinanceAccount[];
};
