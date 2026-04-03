import type { ConfigDefinition } from 'figue';
import * as v from 'valibot';
import { booleanishSchema } from '../../config/config.schemas';

export const autofillConfig = {
  isEnabled: {
    doc: 'Whether to enable auto-fill of custom properties via LLM on document creation',
    schema: booleanishSchema,
    default: false,
    env: 'AUTOFILL_PROPERTIES_ENABLED',
  },
  openaiApiKey: {
    doc: 'OpenAI API key for auto-fill feature',
    schema: v.optional(v.string()),
    default: undefined,
    env: 'OPENAI_API_KEY',
  },
  model: {
    doc: 'OpenAI model to use for auto-fill',
    schema: v.string(),
    default: 'gpt-4o-mini',
    env: 'AUTOFILL_MODEL',
  },
  maxContentLength: {
    doc: 'Maximum content length (chars) to send to the LLM',
    schema: v.pipe(v.number(), v.integer(), v.minValue(100)),
    default: 4000,
    env: 'AUTOFILL_MAX_CONTENT_LENGTH',
  },
} as const satisfies ConfigDefinition;
