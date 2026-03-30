import type { meetingsTable, meetingChunksTable } from './meetings.tables';

export type DbSelectableMeeting = typeof meetingsTable.$inferSelect;
export type DbInsertableMeeting = typeof meetingsTable.$inferInsert;

export type DbSelectableMeetingChunk = typeof meetingChunksTable.$inferSelect;
export type DbInsertableMeetingChunk = typeof meetingChunksTable.$inferInsert;

export type MeetingForCreation = {
  title: string;
  sourceName?: string;
  sourceStorageKey?: string;
  transcriptStorageKey?: string;
  rawTranscriptStorageKey?: string;
  language?: string;
  context?: string;
  summary?: string;
  startedAt?: Date;
  endedAt?: Date;
  chunks: MeetingChunkForCreation[];
};

export type MeetingForIngestion = Omit<MeetingForCreation, 'sourceStorageKey'> & {
  sourceStorageKey: string;
};

export type MeetingForUpdate = {
  title?: string;
  sourceName?: string;
  sourceStorageKey?: string;
  transcriptStorageKey?: string;
  rawTranscriptStorageKey?: string;
  language?: string;
  context?: string;
  summary?: string;
  status?: string;
  startedAt?: Date;
  endedAt?: Date;
};

export type MeetingChunkForCreation = {
  speaker?: string;
  startedAtMs?: number;
  endedAtMs?: number;
  content: string;
};

export type MeetingSearchMatch = {
  chunkId: string;
  speaker: string | null;
  startedAtMs: number | null;
  endedAtMs: number | null;
  content: string;
  snippet: string;
};

export type MeetingForApi = DbSelectableMeeting & {
  chunks?: DbSelectableMeetingChunk[];
  matches?: MeetingSearchMatch[];
};
