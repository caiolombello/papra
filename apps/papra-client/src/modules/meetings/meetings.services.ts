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

export async function uploadMeetingFile({
  file,
  organizationId,
  onProgress,
}: {
  file: File;
  organizationId: string;
  onProgress?: (progress: number) => void;
}) {
  const { uploadUrl } = await apiClient<{ uploadUrl: string; storageKey: string; fileName: string }>({
    method: 'POST',
    path: `/api/organizations/${organizationId}/meetings/upload/presign`,
    body: { fileName: file.name },
  });

  await uploadToPresignedUrl({ file, uploadUrl, onProgress });
}

function uploadToPresignedUrl({
  file,
  uploadUrl,
  onProgress,
}: {
  file: File;
  uploadUrl: string;
  onProgress?: (progress: number) => void;
}) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress?.(event.loaded / event.total);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

    xhr.open('PUT', uploadUrl);
    xhr.send(file);
  });
}

export async function deleteMeeting({
  organizationId,
  meetingId,
}: {
  organizationId: string;
  meetingId: string;
}) {
  await apiClient({
    method: 'DELETE',
    path: `/api/organizations/${organizationId}/meetings/${meetingId}`,
  });
}
