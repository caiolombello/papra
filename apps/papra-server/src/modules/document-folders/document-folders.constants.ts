import { createPrefixedIdRegex } from '../shared/random/ids';

export const DOCUMENT_FOLDER_ID_PREFIX = 'dfld';
export const DOCUMENT_FOLDER_ID_REGEX = createPrefixedIdRegex({ prefix: DOCUMENT_FOLDER_ID_PREFIX });
