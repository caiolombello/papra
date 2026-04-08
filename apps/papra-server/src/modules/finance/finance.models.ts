import { generateId } from '../shared/random/ids';
import {
  FINANCE_ITEM_ID_PREFIX,
  FINANCE_ACCOUNT_ID_PREFIX,
  FINANCE_TRANSACTION_ID_PREFIX,
  FINANCE_BILL_ID_PREFIX,
  FINANCE_INVESTMENT_ID_PREFIX,
  FINANCE_CATEGORY_ID_PREFIX,
  FINANCE_CATEGORY_RULE_ID_PREFIX,
  FINANCE_BUDGET_ID_PREFIX,
  FINANCE_SYNC_LOG_ID_PREFIX,
} from './finance.constants';

export const generateFinanceItemId = () => generateId({ prefix: FINANCE_ITEM_ID_PREFIX });
export const generateFinanceAccountId = () => generateId({ prefix: FINANCE_ACCOUNT_ID_PREFIX });
export const generateFinanceTransactionId = () => generateId({ prefix: FINANCE_TRANSACTION_ID_PREFIX });
export const generateFinanceBillId = () => generateId({ prefix: FINANCE_BILL_ID_PREFIX });
export const generateFinanceInvestmentId = () => generateId({ prefix: FINANCE_INVESTMENT_ID_PREFIX });
export const generateFinanceCategoryId = () => generateId({ prefix: FINANCE_CATEGORY_ID_PREFIX });
export const generateFinanceCategoryRuleId = () => generateId({ prefix: FINANCE_CATEGORY_RULE_ID_PREFIX });
export const generateFinanceBudgetId = () => generateId({ prefix: FINANCE_BUDGET_ID_PREFIX });
export const generateFinanceSyncLogId = () => generateId({ prefix: FINANCE_SYNC_LOG_ID_PREFIX });
