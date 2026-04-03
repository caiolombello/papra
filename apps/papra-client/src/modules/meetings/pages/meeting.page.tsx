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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/modules/ui/components/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/modules/ui/components/tabs';
import { createToast } from '@/modules/ui/components/sonner';
import { ShareLinkButton } from '@/modules/share-links/share-link-button.component';
import { Tag as TagComponent } from '@/modules/tags/components/tag.component';
import { addTagToMeeting, deleteMeeting, diarizeMeeting, fetchMeeting, fetchMeetingPlaybackUrl, removeTagFromMeeting, retranscribeMeeting, fetchAvailableTranslations, fetchTranslation, translateMeeting, fetchTranslations } from '../meetings.services';
import type { MeetingTranslation } from '../meetings.services';

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

function groupChunksIntoParagraphs(chunks: { content: string; startedAtMs?: number | null; endedAtMs?: number | null }[]): string[] {
  if (chunks.length === 0) return [];

  const PAUSE_THRESHOLD_MS = 2000;
  const MAX_CHUNKS_PER_PARAGRAPH = 6;

  const paragraphs: string[] = [];
  let current: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    current.push(chunks[i].content);

    const isLast = i === chunks.length - 1;
    const hasTimestamps = chunks[i].endedAtMs != null && chunks[i + 1]?.startedAtMs != null;
    const pauseDetected = hasTimestamps && (chunks[i + 1].startedAtMs! - chunks[i].endedAtMs!) > PAUSE_THRESHOLD_MS;
    const chunkLimitReached = !hasTimestamps && current.length >= MAX_CHUNKS_PER_PARAGRAPH;

    if (isLast || pauseDetected || chunkLimitReached) {
      paragraphs.push(current.join(' '));
      current = [];
    }
  }

  return paragraphs;
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
    mutationFn: (speakersExpected?: number) => diarizeMeeting({ organizationId: params.organizationId, meetingId: params.meetingId, speakersExpected }),
    onSuccess: () => {
      createToast({ type: 'success', message: 'Speaker identification started. This may take several minutes.' });
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'meetings', params.meetingId] });
    },
    onError: (error) => {
      createToast({ type: 'error', message: getErrorMessage({ error }) });
    },
  }));

  const handleDiarize = async () => {
    const input = prompt('Number of speakers (leave empty for auto-detect):');
    if (input === null) return; // cancelled
    const num = input.trim() ? Number.parseInt(input.trim(), 10) : undefined;
    if (input.trim() && (Number.isNaN(num!) || num! < 2 || num! > 10)) {
      createToast({ type: 'error', message: 'Enter a number between 2 and 10, or leave empty.' });
      return;
    }
    diarizeMutation.mutate(num);
  };

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
                        onClick={handleDiarize}
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

                {(() => {
                  const [activeTab, setActiveTab] = createSignal('original');

                  const translationsQuery = useQuery(() => ({
                    queryKey: ['organizations', params.organizationId, 'meetings', params.meetingId, 'translations'],
                    queryFn: () => fetchTranslations({ organizationId: params.organizationId, meetingId: params.meetingId }),
                    refetchInterval: (query) => {
                      const translations = query.state.data?.translations ?? [];
                      return translations.some(t => t.status === 'processing') ? 5000 : false;
                    },
                  }));

                  const availableQuery = useQuery(() => ({
                    queryKey: ['organizations', params.organizationId, 'meetings', params.meetingId, 'translations-available'],
                    queryFn: () => fetchAvailableTranslations({ organizationId: params.organizationId, meetingId: params.meetingId }),
                    enabled: Boolean(meeting.language),
                  }));

                  const translateMutation = useMutation(() => ({
                    mutationFn: (targetLanguage: string) => translateMeeting({ organizationId: params.organizationId, meetingId: params.meetingId, targetLanguage }),
                    onSuccess: (_, targetLanguage) => {
                      createToast({ type: 'success', message: `Translation to ${targetLanguage} started...` });
                      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'meetings', params.meetingId, 'translations'] });
                      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'meetings', params.meetingId, 'translations-available'] });
                    },
                    onError: (error) => createToast({ type: 'error', message: getErrorMessage({ error }) }),
                  }));

                  const completedTranslations = () => (translationsQuery.data?.translations ?? []).filter(t => t.status === 'completed');
                  const processingTranslations = () => (translationsQuery.data?.translations ?? []).filter(t => t.status === 'processing');

                  // Active chunks for copy button
                  const getActiveChunks = () => {
                    const tab = activeTab();
                    if (tab === 'original') return meeting.chunks ?? [];
                    const translation = completedTranslations().find(t => t.targetLanguage === tab);
                    return translation?.chunks ?? [];
                  };

                  const copyTranscript = () => {
                    const chunks = getActiveChunks();
                    const hasSpeakers = chunks.some((c: any) => c.speaker && c.speaker !== 'unknown');
                    const text = hasSpeakers
                      ? chunks.map((c: any) => `[${c.speaker ?? 'Unknown'}]: ${c.content}`).join('\n\n')
                      : groupChunksIntoParagraphs(chunks).join('\n\n');
                    navigator.clipboard.writeText(text).then(() => {
                      createToast({ type: 'success', message: 'Transcript copied to clipboard' });
                    }).catch(() => {
                      createToast({ type: 'error', message: 'Failed to copy transcript' });
                    });
                  };

                  const renderChunks = (chunks: any[], clickable = true) => {
                    const hasSpeakers = chunks.some(c => c.speaker && c.speaker !== 'unknown');
                    return hasSpeakers
                      ? (
                          <For each={chunks}>
                            {chunk => (
                              <Card
                                class={clickable && chunk.startedAtMs != null ? 'cursor-pointer hover:border-primary/40 transition-colors' : ''}
                                onClick={() => clickable && handleChunkClick(chunk.startedAtMs)}
                              >
                                <CardHeader class="pb-3">
                                  <div class="flex flex-wrap items-center justify-between gap-2">
                                    <Badge variant="outline">{chunk.speaker}</Badge>
                                    <Show when={clickable && formatDurationFromMs(chunk.startedAtMs, chunk.endedAtMs)}>
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
                              <div class="whitespace-pre-wrap text-sm leading-7">
                                {groupChunksIntoParagraphs(chunks).join('\n\n')}
                              </div>
                            </CardContent>
                          </Card>
                        );
                  };

                  return (
                    <div class="space-y-4">
                      <div class="flex items-center justify-between">
                        <h2 class="text-lg font-semibold">{t('meetings.details.transcript.title')}</h2>
                        <div class="flex items-center gap-2">
                          <Show when={(meeting.chunks?.length ?? 0) > 0}>
                            <Button variant="outline" size="sm" onClick={copyTranscript}>
                              <div class="i-tabler-copy size-4 mr-1.5" />
                              Copy transcript
                            </Button>
                          </Show>
                          <Show when={(availableQuery.data?.available?.length ?? 0) > 0}>
                            <DropdownMenu>
                              <DropdownMenuTrigger as={Button} variant="outline" size="sm">
                                <div class="i-tabler-language size-4 mr-1.5" />
                                Translate
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <For each={availableQuery.data?.available ?? []}>
                                  {lang => (
                                    <DropdownMenuItem
                                      disabled={lang.status === 'completed' || lang.status === 'processing'}
                                      onSelect={() => translateMutation.mutate(lang.targetLanguage)}
                                    >
                                      {lang.label}
                                      <Show when={lang.status === 'completed'}>
                                        <div class="i-tabler-check size-4 ml-2 text-green-500" />
                                      </Show>
                                      <Show when={lang.status === 'processing'}>
                                        <div class="i-tabler-loader-2 size-4 ml-2 animate-spin" />
                                      </Show>
                                    </DropdownMenuItem>
                                  )}
                                </For>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </Show>
                        </div>
                      </div>

                      <Show
                        when={(meeting.chunks?.length ?? 0) > 0}
                        fallback={<div class="text-sm text-muted-foreground">{t('meetings.details.transcript.empty')}</div>}
                      >
                        <Show
                          when={completedTranslations().length > 0 || processingTranslations().length > 0}
                          fallback={renderChunks(meeting.chunks ?? [])}
                        >
                          <Tabs value={activeTab()} onChange={setActiveTab}>
                            <TabsList>
                              <TabsTrigger value="original">
                                Original ({meeting.language ?? '?'})
                              </TabsTrigger>
                              <For each={completedTranslations()}>
                                {translation => (
                                  <TabsTrigger value={translation.targetLanguage}>
                                    {translation.targetLanguage}
                                  </TabsTrigger>
                                )}
                              </For>
                              <For each={processingTranslations()}>
                                {translation => (
                                  <TabsTrigger value={translation.targetLanguage} disabled>
                                    <div class="i-tabler-loader-2 size-3 animate-spin mr-1" />
                                    {translation.targetLanguage}
                                  </TabsTrigger>
                                )}
                              </For>
                            </TabsList>

                            <TabsContent value="original" class="space-y-4 mt-4">
                              {renderChunks(meeting.chunks ?? [])}
                            </TabsContent>

                            <For each={completedTranslations()}>
                              {translation => {
                                const translationDetailQuery = useQuery(() => ({
                                  queryKey: ['organizations', params.organizationId, 'meetings', params.meetingId, 'translations', translation.id],
                                  queryFn: () => fetchTranslation({ organizationId: params.organizationId, meetingId: params.meetingId, translationId: translation.id }),
                                  enabled: activeTab() === translation.targetLanguage,
                                }));

                                return (
                                  <TabsContent value={translation.targetLanguage} class="space-y-4 mt-4">
                                    <Show
                                      when={translationDetailQuery.data?.translation?.chunks}
                                      fallback={
                                        <div class="flex items-center gap-2 text-sm text-muted-foreground p-4">
                                          <div class="i-tabler-loader-2 size-4 animate-spin" />
                                          Loading translation...
                                        </div>
                                      }
                                    >
                                      {chunks => renderChunks(chunks(), false)}
                                    </Show>
                                  </TabsContent>
                                );
                              }}
                            </For>
                          </Tabs>
                        </Show>
                      </Show>
                    </div>
                  );
                })()}
              </div>
            );
          }}
        </Show>
      </Suspense>
    </div>
  );
};
