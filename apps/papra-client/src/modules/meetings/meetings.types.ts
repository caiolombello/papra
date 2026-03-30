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

export type MeetingTag = {
  id: string;
  name: string;
  color: string;
  description?: string | null;
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
  status?: string;
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt?: Date;
  chunks?: MeetingChunk[];
  matches?: MeetingSearchMatch[];
  tags?: MeetingTag[];
};
