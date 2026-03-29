import { generateId } from '../shared/random/ids';
import { MEETING_CHUNK_ID_PREFIX, MEETING_ID_PREFIX } from './meetings.constants';

export function generateMeetingId() {
  return generateId({ prefix: MEETING_ID_PREFIX });
}

export function generateMeetingChunkId() {
  return generateId({ prefix: MEETING_CHUNK_ID_PREFIX });
}

export function normalizeMeetingSearchQuery({ query }: { query: string }) {
  return query
    .trim()
    .split(/\s+/)
    .map(token => token.replaceAll('"', '""').trim())
    .filter(Boolean)
    .map(token => `"${token}"`)
    .join(' AND ');
}
