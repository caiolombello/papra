import { createPrefixedIdRegex } from '../shared/random/ids';

export const DOCUMENT_VERSION_ID_PREFIX = 'dver';
export const DOCUMENT_VERSION_ID_REGEX = createPrefixedIdRegex({ prefix: DOCUMENT_VERSION_ID_PREFIX });
