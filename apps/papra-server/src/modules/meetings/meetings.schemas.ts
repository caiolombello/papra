import { z } from 'zod';
import { MEETING_ID_REGEX, MEETING_STATUSES } from './meetings.constants';

export const meetingIdSchema = z.string().regex(MEETING_ID_REGEX);

export const meetingChunkForCreationSchema = z.object({
  speaker: z.string().trim().min(1).max(128).optional(),
  startedAtMs: z.coerce.number().min(0).int().optional(),
  endedAtMs: z.coerce.number().min(0).int().optional(),
  content: z.string().trim().min(1),
});

export const createMeetingBodySchema = z.object({
  title: z.string().trim().min(1).max(256),
  sourceName: z.string().trim().max(256).optional(),
  sourceStorageKey: z.string().trim().max(1024).optional(),
  transcriptStorageKey: z.string().trim().max(1024).optional(),
  rawTranscriptStorageKey: z.string().trim().max(1024).optional(),
  language: z.string().trim().max(32).optional(),
  context: z.string().trim().max(64).optional(),
  summary: z.string().trim().max(10000).optional(),
  audioDurationSeconds: z.coerce.number().min(0).optional(),
  startedAt: z.coerce.date().optional(),
  endedAt: z.coerce.date().optional(),
  chunks: z.array(meetingChunkForCreationSchema).min(1).max(10000),
});

export const ingestMeetingBodySchema = createMeetingBodySchema.extend({
  sourceStorageKey: z.string().trim().min(1).max(1024),
});

export const updateMeetingBodySchema = z.object({
  title: z.string().trim().min(1).max(256).optional(),
  sourceName: z.string().trim().max(256).optional(),
  sourceStorageKey: z.string().trim().max(1024).optional(),
  transcriptStorageKey: z.string().trim().max(1024).optional(),
  rawTranscriptStorageKey: z.string().trim().max(1024).optional(),
  language: z.string().trim().max(32).optional(),
  context: z.string().trim().max(64).optional(),
  summary: z.string().trim().max(10000).optional(),
  status: z.enum([MEETING_STATUSES.UPLOADING, MEETING_STATUSES.PROCESSING, MEETING_STATUSES.COMPLETED, MEETING_STATUSES.FAILED]).optional(),
  startedAt: z.coerce.date().optional(),
  endedAt: z.coerce.date().optional(),
}).refine(
  payload => Object.keys(payload).length > 0,
  { message: 'At least one field must be provided' },
);
