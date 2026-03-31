import type { Component } from 'solid-js';
import { useNavigate, useParams } from '@solidjs/router';
import { useMutation, useQuery } from '@tanstack/solid-query';
import { createSignal, For, Show, Suspense } from 'solid-js';
import { RelativeTime } from '@/modules/i18n/components/RelativeTime';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { useConfirmModal } from '@/modules/shared/confirm';
import { useI18nApiErrors } from '@/modules/shared/http/composables/i18n-api-errors';
import { queryClient } from '@/modules/shared/query/query-client';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/ui/components/card';
import { createToast } from '@/modules/ui/components/sonner';
import { ShareLinkButton } from '@/modules/share-links/share-link-button.component';
import { Tag as TagComponent } from '@/modules/tags/components/tag.component';
import { addTagToMeeting, deleteMeeting, diarizeMeeting, fetchMeeting, fetchMeetingPlaybackUrl, removeTagFromMeeting, retranscribeMeeting } from '../meetings.services';

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

const AudioPlayer: Component<{ organizationId: string; meetingId: string; sourceStorageKey?: string }> = (props) => {
  let audioRef: HTMLAudioElement | undefined;
  const [getAudioUrl, setAudioUrl] = createSignal<string | null>(null);
  const [getLoadError, setLoadError] = createSignal(false);

  const playbackQuery = useQuery(() => ({
    queryKey: ['organizations', props.organizationId, 'meetings', props.meetingId, 'playback-url'],
    queryFn: () => fetchMeetingPlaybackUrl({ organizationId: props.organizationId, meetingId: props.meetingId }),
    enabled: Boolean(props.sourceStorageKey),
    retry: false,
    staleTime: 50 * 60 * 1000, // 50 min (URL expires in 60 min)
  }));

  // Watch query data changes and update audio URL
  const audioUrl = () => playbackQuery.data?.playbackUrl ?? null;

  const seekTo = (timeMs: number) => {
    if (audioRef) {
      audioRef.currentTime = timeMs / 1000;
      audioRef.play();
    }
  };

  // Expose seekTo for parent use via window (simple approach for chunk click)
  if (typeof window !== 'undefined') {
    (window as any).__papra_audio_seek = seekTo;
  }

  return (
    <Show when={props.sourceStorageKey}>
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="flex items-center gap-2 text-base">
            <div class="i-tabler-player-play size-5" />
            Audio Player
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Show
            when={!playbackQuery.isError && !getLoadError()}
            fallback={
              <p class="text-sm text-muted-foreground">Audio playback not available (S3 source bucket not configured)</p>
            }
          >
            <Show
              when={audioUrl()}
              fallback={
                <div class="flex items-center gap-2 text-sm text-muted-foreground">
                  <div class="i-tabler-loader-2 size-4 animate-spin" />
                  Loading audio…
                </div>
              }
            >
              {url => (
                <audio
                  ref={audioRef}
                  src={url()}
                  controls
                  class="w-full"
                  onError={() => setLoadError(true)}
                  preload="metadata"
                />
              )}
            </Show>
          </Show>
        </CardContent>
      </Card>
    </Show>
  );
};

export const MeetingPage: Component = () => {
  const params = useParams();
  const navigate = useNavigate();
  const { t, formatDate } = useI18n();
  const { confirm } = useConfirmModal();
  const { getErrorMessage } = useI18nApiErrors({ t });

  const meetingQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'meetings', params.meetingId],
    queryFn: () => fetchMeeting({ organizationId: params.organizationId, meetingId: params.meetingId }),
  }));

  const deleteMeetingMutation = useMutation(() => ({
    mutationFn: () => deleteMeeting({ organizationId: params.organizationId, meetingId: params.meetingId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'meetings'] });
      createToast({ type: 'success', message: t('meetings.delete.success') });
      navigate(`/organizations/${params.organizationId}/meetings`);
    },
    onError: (error) => {
      createToast({ type: 'error', message: getErrorMessage({ error }) });
    },
  }));

  const retranscribeMutation = useMutation(() => ({
    mutationFn: () => retranscribeMeeting({ organizationId: params.organizationId, meetingId: params.meetingId }),
    onSuccess: () => {
      createToast({ type: 'success', message: 'Re-transcription scheduled. The meeting will be updated once processing completes.' });
    },
    onError: (error) => {
      createToast({ type: 'error', message: getErrorMessage({ error }) });
    },
  }));

  const diarizeMutation = useMutation(() => ({
    mutationFn: () => diarizeMeeting({ organizationId: params.organizationId, meetingId: params.meetingId }),
    onSuccess: () => {
      createToast({ type: 'success', message: 'Speaker identification started. This may take several minutes.' });
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'meetings', params.meetingId] });
    },
    onError: (error) => {
      createToast({ type: 'error', message: getErrorMessage({ error }) });
    },
  }));

  const handleDelete = async () => {
    const isConfirmed = await confirm({
      title: t('meetings.delete.confirm.title'),
      message: t('meetings.delete.confirm.message'),
      confirmButton: {
        text: t('meetings.delete.confirm.confirm-button'),
        variant: 'destructive',
      },
      cancelButton: {
        text: t('meetings.delete.confirm.cancel-button'),
      },
    });

    if (!isConfirmed) {
      return;
    }

    await deleteMeetingMutation.mutateAsync();
  };

  const handleRetranscribe = async () => {
    const isConfirmed = await confirm({
      title: 'Re-transcribe meeting?',
      message: 'This will re-send the audio for transcription. The existing transcript will be replaced once the new one is ready.',
      confirmButton: {
        text: 'Re-transcribe',
      },
    });

    if (isConfirmed) {
      retranscribeMutation.mutate();
    }
  };

  const handleChunkClick = (startedAtMs?: number | null) => {
    if (startedAtMs != null && typeof (window as any).__papra_audio_seek === 'function') {
      (window as any).__papra_audio_seek(startedAtMs);
    }
  };

  return (
    <div class="p-6 mt-4 pb-32 max-w-5xl mx-auto">
      <Suspense>
        <Show when={meetingQuery.data?.meeting}>
          {getMeeting => {
            const meeting = getMeeting();
            return (
              <div class="space-y-6">
                <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div class="space-y-3 min-w-0">
                    <h1 class="text-2xl font-semibold leading-tight">{meeting.title}</h1>
                    <div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>{t('meetings.details.created-at')}</span>
                      <RelativeTime date={meeting.createdAt} />
                      <Show when={meeting.sourceName}>
                        <span class="truncate">{meeting.sourceName}</span>
                      </Show>
                    </div>
                    <div class="flex flex-wrap gap-2 items-center">
                      <For each={meeting.tags ?? []}>
                        {tag => (
                          <TagComponent
                            name={tag.name}
                            color={tag.color}
                            closable
                            onClose={async () => {
                              await removeTagFromMeeting({ organizationId: params.organizationId, meetingId: meeting.id, tagId: tag.id });
                              await queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'meetings', meeting.id] });
                            }}
                          />
                        )}
                      </For>
                      <Show when={meeting.language}>
                        <Badge variant="outline">{meeting.language}</Badge>
                      </Show>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <Show when={meeting.sourceStorageKey}>
                      <Button
                        variant="outline"
                        onClick={handleRetranscribe}
                        isLoading={retranscribeMutation.isPending}
                      >
                        <div class="i-tabler-refresh size-4 mr-1.5" />
                        Re-transcribe
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => diarizeMutation.mutate()}
                        isLoading={diarizeMutation.isPending}
                      >
                        <div class="i-tabler-users size-4 mr-1.5" />
                        Identify Speakers
                      </Button>
                    </Show>
                    <ShareLinkButton
                      organizationId={params.organizationId}
                      resourceType="meeting"
                      resourceId={meeting.id}
                    />
                    <Button
                      variant="destructive"
                      onClick={handleDelete}
                      isLoading={deleteMeetingMutation.isPending}
                    >
                      {t('meetings.delete.button')}
                    </Button>
                  </div>
                </div>

                <AudioPlayer
                  organizationId={params.organizationId}
                  meetingId={params.meetingId}
                  sourceStorageKey={meeting.sourceStorageKey}
                />

                <Show when={meeting.summary}>
                  <Card>
                    <CardHeader>
                      <CardTitle>Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p class="text-sm leading-6 whitespace-pre-wrap">{meeting.summary}</p>
                    </CardContent>
                  </Card>
                </Show>

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
                    {(() => {
                      const hasSpeakers = meeting.chunks?.some(c => c.speaker && c.speaker !== 'unknown') ?? false;

                      return hasSpeakers
                        ? (
                            <For each={meeting.chunks ?? []}>
                              {chunk => (
                                <Card
                                  class={chunk.startedAtMs != null ? 'cursor-pointer hover:border-primary/40 transition-colors' : ''}
                                  onClick={() => handleChunkClick(chunk.startedAtMs)}
                                >
                                  <CardHeader class="pb-3">
                                    <div class="flex flex-wrap items-center justify-between gap-2">
                                      <Badge variant="outline">{chunk.speaker}</Badge>
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
                          )
                        : (
                            <Card>
                              <CardContent class="pt-6">
                                <div class="whitespace-pre-wrap text-sm leading-6">
                                  {meeting.chunks?.map(c => c.content).join(' ')}
                                </div>
                              </CardContent>
                            </Card>
                          );
                    })()}
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
