import type { AsDto } from '../shared/http/http-client.types';
import type { Document } from '../documents/documents.types';
import type { Meeting } from '../meetings/meetings.types';
import { apiClient } from '../shared/http/api-client';
import { coerceDates } from '../shared/http/http-client.models';

function coerceDocument(document: AsDto<Document>): Document {
  return coerceDates(document) as Document;
}

function coerceMeeting(meeting: AsDto<Meeting>): Meeting {
  return {
    ...coerceDates(meeting),
    ...(meeting.startedAt ? { startedAt: new Date(meeting.startedAt) } : {}),
    ...(meeting.endedAt ? { endedAt: new Date(meeting.endedAt) } : {}),
  } as Meeting;
}

export async function searchOrganizationContent({
  organizationId,
  searchQuery,
  scope = 'all',
  pageIndex,
  pageSize,
}: {
  organizationId: string;
  searchQuery: string;
  scope?: 'all' | 'documents' | 'meetings';
  pageIndex: number;
  pageSize: number;
}) {
  const response = await apiClient<{
    documents: AsDto<Document>[];
    documentsCount: number;
    meetings: AsDto<Meeting>[];
    meetingsCount: number;
    totalCount: number;
    scope: 'all' | 'documents' | 'meetings';
  }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/search`,
    query: { searchQuery, scope, pageIndex, pageSize },
  });

  return {
    ...response,
    documents: response.documents.map(coerceDocument),
    meetings: response.meetings.map(coerceMeeting),
  };
}
