export type MeetingChunk = {
  id: string;
  meetingId: string;
  speaker?: string | null;
  startedAtMs?: number | null;
  endedAtMs?: number | null;
  content: string;
};

export type MeetingSearchMatch = {
  chunkId: string;
  speaker?: string | null;
  startedAtMs?: number | null;
  endedAtMs?: number | null;
  content: string;
  snippet: string;
};

export type Meeting = {
  id: string;
  organizationId: string;
  createdBy: string;
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
  createdAt: Date;
  updatedAt?: Date;
  chunks?: MeetingChunk[];
  matches?: MeetingSearchMatch[];
};
