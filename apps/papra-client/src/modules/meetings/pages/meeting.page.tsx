import type { Component } from 'solid-js';
import { useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { For, Show, Suspense } from 'solid-js';
import { RelativeTime } from '@/modules/i18n/components/RelativeTime';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { Badge } from '@/modules/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/ui/components/card';
import { fetchMeeting } from '../meetings.services';

function formatDurationFromMs(startedAtMs?: number | null, endedAtMs?: number | null) {
  if (startedAtMs == null && endedAtMs == null) {
    return '';
  }

  const formatPoint = (value?: number | null) => {
    if (value == null) {
      return '';
    }
    const totalSeconds = Math.floor(value / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
  };

  const start = formatPoint(startedAtMs);
  const end = formatPoint(endedAtMs);
  if (start && end) {
    return `${start} - ${end}`;
  }
  return start || end;
}

export const MeetingPage: Component = () => {
  const params = useParams();
  const { t, formatDate } = useI18n();

  const meetingQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'meetings', params.meetingId],
    queryFn: () => fetchMeeting({ organizationId: params.organizationId, meetingId: params.meetingId }),
  }));

  return (
    <div class="p-6 mt-4 pb-32 max-w-5xl mx-auto">
      <Suspense>
        <Show when={meetingQuery.data?.meeting}>
          {getMeeting => {
            const meeting = getMeeting();
            return (
              <div class="space-y-6">
                <div class="space-y-3">
                  <h1 class="text-2xl font-semibold leading-tight">{meeting.title}</h1>
                  <div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{t('meetings.details.created-at')}</span>
                    <RelativeTime date={meeting.createdAt} />
                    <Show when={meeting.sourceName}>
                      <span class="truncate">{meeting.sourceName}</span>
                    </Show>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <Show when={meeting.context}>
                      <Badge variant="secondary">{meeting.context}</Badge>
                    </Show>
                    <Show when={meeting.language}>
                      <Badge variant="outline">{meeting.language}</Badge>
                    </Show>
                  </div>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('meetings.details.metadata.title')}</CardTitle>
                    <CardDescription>{t('meetings.details.metadata.description')}</CardDescription>
                  </CardHeader>
                  <CardContent class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <div class="text-muted-foreground">{t('meetings.details.metadata.source-storage-key')}</div>
                      <div class="break-all">{meeting.sourceStorageKey ?? '-'}</div>
                    </div>
                    <div>
                      <div class="text-muted-foreground">{t('meetings.details.metadata.transcript-storage-key')}</div>
                      <div class="break-all">{meeting.transcriptStorageKey ?? '-'}</div>
                    </div>
                    <div>
                      <div class="text-muted-foreground">{t('meetings.details.metadata.created-at')}</div>
                      <div>{formatDate(meeting.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</div>
                    </div>
                    <div>
                      <div class="text-muted-foreground">{t('meetings.details.metadata.updated-at')}</div>
                      <div>{meeting.updatedAt ? formatDate(meeting.updatedAt, { dateStyle: 'medium', timeStyle: 'short' }) : '-'}</div>
                    </div>
                  </CardContent>
                </Card>

                <div class="space-y-4">
                  <h2 class="text-lg font-semibold">{t('meetings.details.transcript.title')}</h2>
                  <Show
                    when={(meeting.chunks?.length ?? 0) > 0}
                    fallback={<div class="text-sm text-muted-foreground">{t('meetings.details.transcript.empty')}</div>}
                  >
                    <For each={meeting.chunks ?? []}>
                      {chunk => (
                        <Card>
                          <CardHeader class="pb-3">
                            <div class="flex flex-wrap items-center justify-between gap-2">
                              <div class="flex items-center gap-2">
                                <Badge variant="outline">{chunk.speaker || t('meetings.details.transcript.unknown-speaker')}</Badge>
                              </div>
                              <Show when={formatDurationFromMs(chunk.startedAtMs, chunk.endedAtMs)}>
                                <div class="text-xs text-muted-foreground">
                                  {formatDurationFromMs(chunk.startedAtMs, chunk.endedAtMs)}
                                </div>
                              </Show>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div class="whitespace-pre-wrap text-sm leading-6">{chunk.content}</div>
                          </CardContent>
                        </Card>
                      )}
                    </For>
                  </Show>
                </div>
              </div>
            );
          }}
        </Show>
      </Suspense>
    </div>
  );
};
