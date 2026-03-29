import { createPrefixedIdRegex } from '../shared/random/ids';

export const MEETING_ID_PREFIX = 'mtg';
export const MEETING_ID_REGEX = createPrefixedIdRegex({ prefix: MEETING_ID_PREFIX });

export const MEETING_CHUNK_ID_PREFIX = 'mch';
export const MEETING_CHUNK_ID_REGEX = createPrefixedIdRegex({ prefix: MEETING_CHUNK_ID_PREFIX });
