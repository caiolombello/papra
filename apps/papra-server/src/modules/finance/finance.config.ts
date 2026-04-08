import type { ConfigDefinition } from 'figue';
import * as v from 'valibot';
import { coercedPositiveIntegerSchema } from '../shared/schemas/number.schemas';

export const financeConfig = {
  pluggy: {
    clientId: {
      doc: 'Pluggy API client ID',
      schema: v.string(),
      default: '',
      env: 'PLUGGY_CLIENT_ID',
    },
    clientSecret: {
      doc: 'Pluggy API client secret',
      schema: v.string(),
      default: '',
      env: 'PLUGGY_CLIENT_SECRET',
    },
  },
  syncIntervalHours: {
    doc: 'How often to sync financial data from Pluggy (in hours)',
    schema: v.pipe(coercedPositiveIntegerSchema, v.minValue(1), v.maxValue(24)),
    default: 6,
    env: 'FINANCE_SYNC_INTERVAL_HOURS',
  },
  financialMonthStartDay: {
    doc: 'Day of month when the financial month starts (e.g., 15 for salary day)',
    schema: v.pipe(coercedPositiveIntegerSchema, v.minValue(1), v.maxValue(28)),
    default: 15,
    env: 'FINANCE_FINANCIAL_MONTH_START_DAY',
  },
} as const satisfies ConfigDefinition;
