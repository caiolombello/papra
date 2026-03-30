import type { Database } from '../app/database/database.types';
import type { MeetingStatus } from './meetings.constants';
import type { DbSelectableMeeting, DbSelectableMeetingChunk, MeetingChunkForCreation, MeetingForApi, MeetingForCreation, MeetingForIngestion, MeetingForUpdate, MeetingSearchMatch } from './meetings.types';
import { injectArguments } from '@corentinth/chisels';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { MEETING_STATUSES } from './meetings.constants';
import { meetingsTable, meetingChunksTable } from './meetings.tables';
import { normalizeMeetingSearchQuery } from './meetings.models';

export type MeetingsRepository = ReturnType<typeof createMeetingsRepository>;

export function createMeetingsRepository({ db }: { db: Database }) {
  return injectArguments({
    createMeeting,
    listOrganizationMeetings,
    getMeetingById,
    getMeetingBySourceStorageKey,
    getMeetingChunks,
    updateMeeting,
    updateMeetingStatus,
    replaceMeetingChunks,
    upsertMeetingFromIngestion,
    deleteMeeting,
    searchOrganizationMeetings,
    getMeetingStats,
  }, { db });
}

async function createMeeting({
  organizationId,
  createdBy,
  meeting,
  status,
  db,
}: {
  organizationId: string;
  createdBy: string;
  meeting: MeetingForCreation;
  status?: MeetingStatus;
  db: Database;
}) {
  const [createdMeeting] = await db
    .insert(meetingsTable)
    .values({
      organizationId,
      createdBy,
      title: meeting.title,
      sourceName: meeting.sourceName,
      sourceStorageKey: meeting.sourceStorageKey,
      transcriptStorageKey: meeting.transcriptStorageKey,
      rawTranscriptStorageKey: meeting.rawTranscriptStorageKey,
      language: meeting.language,
      context: meeting.context,
      summary: meeting.summary,
      startedAt: meeting.startedAt,
      endedAt: meeting.endedAt,
      ...(status !== undefined && { status }),
    })
    .returning();

  if (!createdMeeting) {
    throw new Error('Failed to create meeting');
  }

  if (meeting.chunks.length > 0) {
    await db.insert(meetingChunksTable).values(
      meeting.chunks.map((chunk, chunkIndex) => createChunkInsert({
        meetingId: createdMeeting.id,
        organizationId,
        chunkIndex,
        chunk,
      })),
    );
  }

  return { meeting: createdMeeting };
}

function createChunkInsert({
  meetingId,
  organizationId,
  chunkIndex,
  chunk,
}: {
  meetingId: string;
  organizationId: string;
  chunkIndex: number;
  chunk: MeetingChunkForCreation;
}) {
  return {
    meetingId,
    organizationId,
    chunkIndex,
    speaker: chunk.speaker,
    startedAtMs: chunk.startedAtMs,
    endedAtMs: chunk.endedAtMs,
    content: chunk.content,
  };
}

async function listOrganizationMeetings({
  organizationId,
  pageIndex,
  pageSize,
  db,
}: {
  organizationId: string;
  pageIndex: number;
  pageSize: number;
  db: Database;
}) {
  const [meetings, countResult] = await Promise.all([
    db.select().from(meetingsTable)
      .where(eq(meetingsTable.organizationId, organizationId))
      .orderBy(desc(meetingsTable.createdAt))
      .limit(pageSize)
      .offset(pageIndex * pageSize),
    db.select({ count: sql<number>`COUNT(${meetingsTable.id})` }).from(meetingsTable).where(eq(meetingsTable.organizationId, organizationId)),
  ]);

  return {
    meetings,
    meetingsCount: countResult[0]?.count ?? 0,
  };
}

async function getMeetingById({
  organizationId,
  meetingId,
  db,
}: {
  organizationId: string;
  meetingId: string;
  db: Database;
}) {
  const [meeting] = await db.select().from(meetingsTable).where(and(
    eq(meetingsTable.organizationId, organizationId),
    eq(meetingsTable.id, meetingId),
  ));

  return { meeting };
}

async function getMeetingBySourceStorageKey({
  organizationId,
  sourceStorageKey,
  db,
}: {
  organizationId: string;
  sourceStorageKey: string;
  db: Database;
}) {
  const [meeting] = await db.select().from(meetingsTable).where(and(
    eq(meetingsTable.organizationId, organizationId),
    eq(meetingsTable.sourceStorageKey, sourceStorageKey),
  ));

  return { meeting };
}

async function getMeetingChunks({
  meetingId,
  db,
}: {
  meetingId: string;
  db: Database;
}) {
  const chunks = await db.select().from(meetingChunksTable)
    .where(eq(meetingChunksTable.meetingId, meetingId))
    .orderBy(meetingChunksTable.chunkIndex);

  return { chunks };
}

async function updateMeeting({
  organizationId,
  meetingId,
  meeting,
  db,
}: {
  organizationId: string;
  meetingId: string;
  meeting: MeetingForUpdate;
  db: Database;
}) {
  const [updatedMeeting] = await db
    .update(meetingsTable)
    .set({
      title: meeting.title,
      sourceName: meeting.sourceName,
      sourceStorageKey: meeting.sourceStorageKey,
      transcriptStorageKey: meeting.transcriptStorageKey,
      rawTranscriptStorageKey: meeting.rawTranscriptStorageKey,
      language: meeting.language,
      context: meeting.context,
      summary: meeting.summary,
      startedAt: meeting.startedAt,
      endedAt: meeting.endedAt,
      ...(meeting.status !== undefined && { status: meeting.status }),
      updatedAt: new Date(),
    })
    .where(and(
      eq(meetingsTable.organizationId, organizationId),
      eq(meetingsTable.id, meetingId),
    ))
    .returning();

  return { meeting: updatedMeeting };
}

async function updateMeetingStatus({
  meetingId,
  organizationId,
  status,
  db,
}: {
  meetingId: string;
  organizationId: string;
  status: MeetingStatus;
  db: Database;
}) {
  await db
    .update(meetingsTable)
    .set({ status, updatedAt: new Date() })
    .where(and(
      eq(meetingsTable.id, meetingId),
      eq(meetingsTable.organizationId, organizationId),
    ));
}

async function replaceMeetingChunks({
  meetingId,
  organizationId,
  chunks,
  db,
}: {
  meetingId: string;
  organizationId: string;
  chunks: MeetingChunkForCreation[];
  db: Database;
}) {
  await db.delete(meetingChunksTable).where(eq(meetingChunksTable.meetingId, meetingId));

  if (chunks.length === 0) {
    return;
  }

  await db.insert(meetingChunksTable).values(
    chunks.map((chunk, chunkIndex) => createChunkInsert({
      meetingId,
      organizationId,
      chunkIndex,
      chunk,
    })),
  );
}

async function upsertMeetingFromIngestion({
  organizationId,
  createdBy,
  meeting,
  db,
}: {
  organizationId: string;
  createdBy: string;
  meeting: MeetingForIngestion;
  db: Database;
}) {
  const { meeting: existingMeeting } = await getMeetingBySourceStorageKey({
    organizationId,
    sourceStorageKey: meeting.sourceStorageKey,
    db,
  });

  if (!existingMeeting) {
    const { meeting: createdMeeting } = await createMeeting({
      organizationId,
      createdBy,
      meeting,
      status: MEETING_STATUSES.COMPLETED,
      db,
    });

    return {
      meeting: createdMeeting,
      mode: 'created' as const,
    };
  }

  const { meeting: updatedMeeting } = await updateMeeting({
    organizationId,
    meetingId: existingMeeting.id,
    meeting: {
      title: meeting.title,
      sourceName: meeting.sourceName,
      sourceStorageKey: meeting.sourceStorageKey,
      transcriptStorageKey: meeting.transcriptStorageKey,
      rawTranscriptStorageKey: meeting.rawTranscriptStorageKey,
      language: meeting.language,
      context: meeting.context,
      summary: meeting.summary,
      startedAt: meeting.startedAt,
      endedAt: meeting.endedAt,
      status: MEETING_STATUSES.COMPLETED,
    },
    db,
  });

  if (!updatedMeeting) {
    throw new Error('Failed to update existing meeting during ingestion');
  }

  await replaceMeetingChunks({
    meetingId: existingMeeting.id,
    organizationId,
    chunks: meeting.chunks,
    db,
  });

  return {
    meeting: updatedMeeting,
    mode: 'updated' as const,
  };
}

async function getMeetingStats({
  organizationId,
  db,
}: {
  organizationId: string;
  db: Database;
}) {
  const [result] = await db.select({
    total: sql<number>`COUNT(*)`,
    completed: sql<number>`SUM(CASE WHEN ${meetingsTable.status} = 'completed' THEN 1 ELSE 0 END)`,
    processing: sql<number>`SUM(CASE WHEN ${meetingsTable.status} IN ('processing', 'uploading') THEN 1 ELSE 0 END)`,
    failed: sql<number>`SUM(CASE WHEN ${meetingsTable.status} = 'failed' THEN 1 ELSE 0 END)`,
  }).from(meetingsTable).where(eq(meetingsTable.organizationId, organizationId));

  return {
    stats: {
      total: result?.total ?? 0,
      completed: result?.completed ?? 0,
      processing: result?.processing ?? 0,
      failed: result?.failed ?? 0,
    },
  };
}

async function deleteMeeting({
  organizationId,
  meetingId,
  db,
}: {
  organizationId: string;
  meetingId: string;
  db: Database;
}) {
  await db
    .delete(meetingsTable)
    .where(and(
      eq(meetingsTable.organizationId, organizationId),
      eq(meetingsTable.id, meetingId),
    ));
}

async function searchOrganizationMeetings({
  organizationId,
  searchQuery,
  pageIndex,
  pageSize,
  db,
}: {
  organizationId: string;
  searchQuery: string;
  pageIndex: number;
  pageSize: number;
  db: Database;
}) {
  const normalizedSearchQuery = normalizeMeetingSearchQuery({ query: searchQuery });
  const titleLikeQuery = `%${searchQuery.trim().toLowerCase()}%`;

  if (normalizedSearchQuery.length === 0 && searchQuery.trim().length === 0) {
    return {
      meetings: [],
      meetingsCount: 0,
    };
  }

  const countResult = await db.run(sql`
    WITH matched_meeting_ids AS (
      SELECT id AS meeting_id
      FROM meetings
      WHERE organization_id = ${organizationId}
        AND lower(title) LIKE ${titleLikeQuery}
      UNION
      SELECT DISTINCT meeting_id
      FROM meeting_chunks_fts
      WHERE organization_id = ${organizationId}
        AND meeting_chunks_fts MATCH ${normalizedSearchQuery}
    )
    SELECT COUNT(*) as count
    FROM matched_meeting_ids
  `);

  const paginatedResult = await db.run(sql`
    WITH title_matches AS (
      SELECT id AS meeting_id, updated_at AS ranking
      FROM meetings
      WHERE organization_id = ${organizationId}
        AND lower(title) LIKE ${titleLikeQuery}
    ),
    chunk_matches AS (
      SELECT meeting_id, MAX(rowid) as ranking
      FROM meeting_chunks_fts
      WHERE organization_id = ${organizationId}
        AND meeting_chunks_fts MATCH ${normalizedSearchQuery}
      GROUP BY meeting_id
    ),
    merged_matches AS (
      SELECT meeting_id, ranking FROM title_matches
      UNION ALL
      SELECT meeting_id, ranking FROM chunk_matches
    )
    SELECT meeting_id, MAX(ranking) as ranking
    FROM merged_matches
    GROUP BY meeting_id
    ORDER BY ranking DESC
    LIMIT ${pageSize}
    OFFSET ${pageIndex * pageSize}
  `);

  const meetingIds = paginatedResult.rows
    .map(row => String(row.meeting_id))
    .filter(Boolean);

  if (meetingIds.length === 0) {
    return {
      meetings: [],
      meetingsCount: countResult.rows[0]?.count ? Number(countResult.rows[0].count) : 0,
    };
  }

  const meetings = await db.select().from(meetingsTable)
    .where(and(
      eq(meetingsTable.organizationId, organizationId),
      inArray(meetingsTable.id, meetingIds),
    ));

  const meetingsById = new Map(meetings.map(meeting => [meeting.id, meeting]));
  const matchesByMeetingId = await getSearchMatchesByMeetingId({
    db,
    organizationId,
    meetingIds,
    normalizedSearchQuery,
    searchQuery,
  });

  return {
    meetings: meetingIds
      .map((meetingId) => {
        const meeting = meetingsById.get(meetingId);

        if (!meeting) {
          return null;
        }

        return {
          ...meeting,
          matches: matchesByMeetingId.get(meetingId) ?? [],
        } satisfies MeetingForApi;
      })
      .filter(Boolean) as MeetingForApi[],
    meetingsCount: countResult.rows[0]?.count ? Number(countResult.rows[0].count) : 0,
  };
}

async function getSearchMatchesByMeetingId({
  db,
  organizationId,
  meetingIds,
  normalizedSearchQuery,
  searchQuery,
}: {
  db: Database;
  organizationId: string;
  meetingIds: string[];
  normalizedSearchQuery: string;
  searchQuery: string;
}) {
  const titleLikeQuery = `%${searchQuery.trim().toLowerCase()}%`;
  const titleMatchesResult = await db.run(sql`
    SELECT
      id as meeting_id,
      title as title
    FROM meetings
    WHERE organization_id = ${organizationId}
      AND id IN (${sql.join(meetingIds.map(meetingId => sql`${meetingId}`), sql`, `)})
      AND lower(title) LIKE ${titleLikeQuery}
  `);

  const matchesByMeetingId = new Map<string, MeetingSearchMatch[]>();

  for (const row of titleMatchesResult.rows) {
    const meetingId = String(row.meeting_id);
    matchesByMeetingId.set(meetingId, [{
      chunkId: `title:${meetingId}`,
      speaker: null,
      startedAtMs: null,
      endedAtMs: null,
      content: String(row.title),
      snippet: String(row.title),
    }]);
  }

  if (normalizedSearchQuery.length === 0) {
    return matchesByMeetingId;
  }

  const meetingIdsSql = sql.join(meetingIds.map(meetingId => sql`${meetingId}`), sql`, `);
  const result = await db.run(sql`
    SELECT
      mc.meeting_id as meeting_id,
      mc.id as chunk_id,
      mc.speaker as speaker,
      mc.started_at_ms as started_at_ms,
      mc.ended_at_ms as ended_at_ms,
      mc.content as content,
      snippet(meeting_chunks_fts, 4, '[', ']', '…', 12) as snippet,
      bm25(meeting_chunks_fts) as rank
    FROM meeting_chunks_fts
    INNER JOIN meeting_chunks mc ON mc.id = meeting_chunks_fts.chunk_id
    WHERE meeting_chunks_fts.organization_id = ${organizationId}
      AND meeting_chunks_fts MATCH ${normalizedSearchQuery}
      AND meeting_chunks_fts.meeting_id IN (${meetingIdsSql})
    ORDER BY rank ASC
  `);
  for (const row of result.rows) {
    const meetingId = String(row.meeting_id);
    const currentMatches = matchesByMeetingId.get(meetingId) ?? [];

    if (currentMatches.length >= 3) {
      continue;
    }

    currentMatches.push({
      chunkId: String(row.chunk_id),
      speaker: row.speaker ? String(row.speaker) : null,
      startedAtMs: row.started_at_ms === null || row.started_at_ms === undefined ? null : Number(row.started_at_ms),
      endedAtMs: row.ended_at_ms === null || row.ended_at_ms === undefined ? null : Number(row.ended_at_ms),
      content: String(row.content),
      snippet: String(row.snippet ?? row.content),
    });

    matchesByMeetingId.set(meetingId, currentMatches);
  }

  return matchesByMeetingId;
}
