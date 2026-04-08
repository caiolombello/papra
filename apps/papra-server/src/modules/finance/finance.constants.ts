export const FINANCE_ITEM_ID_PREFIX = 'fin_item_';
export const FINANCE_ACCOUNT_ID_PREFIX = 'fin_acc_';
export const FINANCE_TRANSACTION_ID_PREFIX = 'fin_txn_';
export const FINANCE_BILL_ID_PREFIX = 'fin_bill_';
export const FINANCE_INVESTMENT_ID_PREFIX = 'fin_inv_';
export const FINANCE_CATEGORY_ID_PREFIX = 'fin_cat_';
export const FINANCE_CATEGORY_RULE_ID_PREFIX = 'fin_rule_';
export const FINANCE_BUDGET_ID_PREFIX = 'fin_bgt_';
export const FINANCE_SYNC_LOG_ID_PREFIX = 'fin_sync_';

export const ACCOUNT_TYPES = {
  BANK: 'BANK',
  CREDIT: 'CREDIT',
} as const;

export const TRANSACTION_TYPES = {
  DEBIT: 'DEBIT',
  CREDIT: 'CREDIT',
} as const;

export const TRANSACTION_STATUSES = {
  POSTED: 'POSTED',
  PENDING: 'PENDING',
} as const;

export const BILL_STATUSES = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  PAID: 'PAID',
} as const;

export const SYNC_STATUSES = {
  SUCCESS: 'SUCCESS',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
} as const;
