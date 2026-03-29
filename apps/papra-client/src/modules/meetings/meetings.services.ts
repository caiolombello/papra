import type { AsDto } from '../shared/http/http-client.types';
import type { Meeting } from './meetings.types';
import { apiClient } from '../shared/http/api-client';
import { coerceDates } from '../shared/http/http-client.models';

function coerceMeeting(meeting: AsDto<Meeting>): Meeting {
  return {
    ...coerceDates(meeting),
    ...(meeting.startedAt ? { startedAt: new Date(meeting.startedAt) } : {}),
    ...(meeting.endedAt ? { endedAt: new Date(meeting.endedAt) } : {}),
  } as Meeting;
}

export async function fetchOrganizationMeetings({
  organizationId,
  pageIndex,
  pageSize,
}: {
  organizationId: string;
  pageIndex: number;
  pageSize: number;
}) {
  const { meetings, meetingsCount } = await apiClient<{
    meetings: AsDto<Meeting>[];
    meetingsCount: number;
  }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/meetings`,
    query: { pageIndex, pageSize },
  });

  return {
    meetings: meetings.map(coerceMeeting),
    meetingsCount,
  };
}

export async function searchOrganizationMeetings({
  organizationId,
  searchQuery,
  pageIndex,
  pageSize,
}: {
  organizationId: string;
  searchQuery: string;
  pageIndex: number;
  pageSize: number;
}) {
  const { meetings, totalCount } = await apiClient<{
    meetings: AsDto<Meeting>[];
    totalCount: number;
  }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/meetings/search`,
    query: { searchQuery, pageIndex, pageSize },
  });

  return {
    meetings: meetings.map(coerceMeeting),
    meetingsCount: totalCount,
  };
}

export async function fetchMeeting({
  organizationId,
  meetingId,
}: {
  organizationId: string;
  meetingId: string;
}) {
  const { meeting } = await apiClient<{ meeting: AsDto<Meeting> }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/meetings/${meetingId}`,
  });

  return { meeting: coerceMeeting(meeting) };
}
