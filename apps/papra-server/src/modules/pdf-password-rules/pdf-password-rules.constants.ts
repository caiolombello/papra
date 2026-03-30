import { createPrefixedIdRegex } from '../shared/random/ids';

export const PDF_PASSWORD_RULE_ID_PREFIX = 'ppr';
export const PDF_PASSWORD_RULE_ID_REGEX = createPrefixedIdRegex({ prefix: PDF_PASSWORD_RULE_ID_PREFIX });
