import type { Component } from 'solid-js';
import type { Meeting } from '../meetings.types';
import { A, useParams } from '@solidjs/router';
import { keepPreviousData, useQuery } from '@tanstack/solid-query';
import { createSignal, For, Show, Suspense } from 'solid-js';
import { RelativeTime } from '@/modules/i18n/components/RelativeTime';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { createParamSynchronizedPagination } from '@/modules/shared/pagination/query-synchronized-pagination';
import { createParamSynchronizedSignal } from '@/modules/shared/signals/params';
import { cn } from '@/modules/shared/style/cn';
import { queryClient } from '@/modules/shared/query/query-client';
import { useDebounce } from '@/modules/shared/utils/timing';
import { Tag as TagComponent } from '@/modules/tags/components/tag.component';
import { useConfirmModal } from '@/modules/shared/confirm';
import { Badge } from '@/modules/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/ui/components/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/modules/ui/components/dropdown-menu';
import { EmptyState } from '@/modules/ui/components/empty';
import { Button } from '@/modules/ui/components/button';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
import { MeetingUploadArea } from '../components/meeting-upload-area.component';
import { trackMeetingsForNotifications } from '../composables/use-transcription-notifications';
import { deleteMeeting, diarizeMeeting, fetchOrganizationMeetings, retranscribeMeeting, searchOrganizationMeetings } from '../meetings.services';

function MeetingStatusBadge(props: { status?: string; statusDetail?: string | null }) {
  return (
    <Show when={props.status && props.status !== 'completed'}>
      <Badge
        variant={props.status === 'failed' ? 'destructive' : 'secondary'}
        class="gap-1"
      >
        <Show when={props.status === 'uploading' || props.status === 'processing'}>
          <div class="i-tabler-loader-2 animate-spin size-3" />
        </Show>
        <Show when={props.status === 'failed'}>
          <div class="i-tabler-alert-circle size-3" />
        </Show>
        {props.statusDetail || (props.status === 'uploading' ? 'Uploading...' : props.status === 'processing' ? 'Transcribing...' : 'Failed')}
      </Badge>
    </Show>
  );
}

const MeetingActionsDropdown: Component<{ meeting: Meeting; organizationId: string }> = (props) => {
  const { confirm } = useConfirmModal();

  const handleRetranscribe = async (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    await retranscribeMeeting({ organizationId: props.organizationId, meetingId: props.meeting.id });
    await queryClient.invalidateQueries({ queryKey: ['organizations', props.organizationId, 'meetings'] });
    createToast({ type: 'success', message: 'Re-transcription scheduled' });
  };

  const handleDiarize = async (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    await diarizeMeeting({ organizationId: props.organizationId, meetingId: props.meeting.id });
    await queryClient.invalidateQueries({ queryKey: ['organizations', props.organizationId, 'meetings'] });
    createToast({ type: 'success', message: 'Speaker identification started' });
  };

  const handleDelete = async (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
    const confirmed = await confirm({
      title: 'Delete meeting?',
      message: `Delete "${props.meeting.title}"? This cannot be undone.`,
      confirmButton: { text: 'Delete', variant: 'destructive' },
    });
    if (confirmed) {
      await deleteMeeting({ organizationId: props.organizationId, meetingId: props.meeting.id });
      await queryClient.invalidateQueries({ queryKey: ['organizations', props.organizationId, 'meetings'] });
      createToast({ type: 'success', message: 'Meeting deleted' });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        as={(triggerProps: any) => (
          <Button variant="ghost" size="icon" class="size-7" {...triggerProps} onClick={(e: Event) => { e.stopPropagation(); e.preventDefault(); (triggerProps as any).onClick?.(e); }}>
            <div class="i-tabler-dots-vertical size-4" />
          </Button>
        )}
      />
      <DropdownMenuContent class="w-48">
        <DropdownMenuItem class="cursor-pointer" onClick={handleRetranscribe}>
          <div class="i-tabler-refresh size-4 mr-2" />
          Re-transcribe
        </DropdownMenuItem>
        <DropdownMenuItem class="cursor-pointer" onClick={handleDiarize}>
          <div class="i-tabler-users size-4 mr-2" />
          Identify Speakers
        </DropdownMenuItem>
        <DropdownMenuItem class="cursor-pointer text-red" onClick={handleDelete}>
          <div class="i-tabler-trash size-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const MeetingsPage: Component = () => {
  const params = useParams();
  const { t } = useI18n();
  const [getSearchQuery, setSearchQuery] = createParamSynchronizedSignal<string>({ paramKey: 'query', defaultValue: '' });
  const debouncedSearchQuery = useDebounce(getSearchQuery, 300);
  const [getPagination, setPagination] = createParamSynchronizedPagination();

  const [getPendingFlag, setPendingFlag] = createSignal(false);

  const meetingsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'meetings', getPagination(), debouncedSearchQuery()],
    queryFn: async () => {
      const result = await (debouncedSearchQuery().length > 0
        ? searchOrganizationMeetings({
            organizationId: params.organizationId,
            searchQuery: debouncedSearchQuery(),
            ...getPagination(),
          })
        : fetchOrganizationMeetings({
            organizationId: params.organizationId,
            ...getPagination(),
          }));

      setPendingFlag(result.meetings.some((m: Meeting) => m.status === 'uploading' || m.status === 'processing'));
      trackMeetingsForNotifications(result.meetings);

      return result;
    },
    placeholderData: keepPreviousData,
    refetchInterval: getPendingFlag() ? 5_000 : false,
  }));

  return (
    <div class="p-6 mt-4 pb-32 max-w-5xl mx-auto">
      <Suspense>
        <h2 class="text-lg font-semibold mb-4">{t('meetings.list.title')}</h2>

        <div class="flex items-center">
          <TextFieldRoot class="max-w-md flex-1">
            <TextField
              type="search"
              name="search"
              placeholder={t('meetings.list.search.placeholder')}
              value={getSearchQuery()}
              onInput={e => setSearchQuery(e.currentTarget.value)}
              class="pr-9"
              autofocus
            />
          </TextFieldRoot>

          <Show when={getSearchQuery().length > 0}>
            <Button
              variant="ghost"
              size="icon"
              class="size-6 ml--8"
              disabled={meetingsQuery.isFetching}
              onClick={() => setSearchQuery('')}
              aria-label={meetingsQuery.isFetching ? 'Loading' : 'Clear search'}
            >
              <div class={cn('text-muted-foreground', meetingsQuery.isFetching ? 'i-tabler-loader-2 animate-spin' : 'i-tabler-x')} />
            </Button>
          </Show>
        </div>

        <div class="mt-4 mb-4">
          <MeetingUploadArea />
        </div>

        <div class="mb-6 text-sm text-muted-foreground mt-2 ml-2">
          <Show
            when={debouncedSearchQuery().length > 0}
            fallback={t('meetings.list.search.total-count-no-query', { count: meetingsQuery.data?.meetingsCount ?? 0 })}
          >
            {t('meetings.list.search.total-count-with-query', { count: meetingsQuery.data?.meetingsCount ?? 0 })}
          </Show>
        </div>

        <Show
          when={(meetingsQuery.data?.meetings.length ?? 0) > 0}
          fallback={(
            <EmptyState
              icon="i-tabler-microphone"
              title={t('meetings.list.empty.title')}
              description={debouncedSearchQuery().length > 0
                ? t('meetings.list.empty.filtered-description')
                : t('meetings.list.empty.description')}
            />
          )}
        >
          <div class="space-y-4">
            <For each={meetingsQuery.data?.meetings ?? []}>
              {(meeting) => {
                const isCompleted = () => !meeting.status || meeting.status === 'completed';
                const cardContent = () => (
                  <Card class={cn('transition-colors', isCompleted() ? 'hover:bg-accent/30' : 'opacity-60')}>
                    <CardHeader class="gap-3">
                      <div class="flex items-start justify-between gap-4">
                        <div class="min-w-0">
                          <CardTitle class="text-base truncate">{meeting.title}</CardTitle>
                          <CardDescription class="mt-1">
                            <RelativeTime date={meeting.createdAt} />
                          </CardDescription>
                        </div>
                        <div class="flex flex-wrap items-center gap-2 justify-end">
                          <MeetingStatusBadge status={meeting.status} statusDetail={meeting.statusDetail} />
                          <For each={meeting.tags ?? []}>
                            {tag => <TagComponent name={tag.name} color={tag.color} />}
                          </For>
                          <Show when={meeting.language}>
                            <Badge variant="outline">{meeting.language}</Badge>
                          </Show>
                          <MeetingActionsDropdown meeting={meeting} organizationId={params.organizationId} />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent class="space-y-2">
                      <Show when={meeting.sourceName}>
                        <div class="text-sm text-muted-foreground truncate">{meeting.sourceName}</div>
                      </Show>
                      <Show when={isCompleted()} fallback={
                        <div class="flex items-center justify-between gap-2">
                          <div class="text-sm text-muted-foreground italic flex-1">
                            {meeting.statusDetail || (meeting.status === 'uploading' ? 'Uploading file...' : meeting.status === 'failed' ? 'Transcription failed' : 'Transcription in progress...')}
                          </div>
                          <Show when={meeting.status === 'failed'}>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async (e) => {
                                e.stopPropagation();
                                await retranscribeMeeting({ organizationId: params.organizationId, meetingId: meeting.id });
                                await queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'meetings'] });
                              }}
                            >
                              <div class="i-tabler-refresh size-3.5 mr-1" />
                              Retry
                            </Button>
                          </Show>
                        </div>
                      }>
                        <div class="text-sm leading-6 line-clamp-4">
                          {meeting.matches?.[0]?.snippet || meeting.summary || meeting.chunks?.[0]?.content || t('meetings.list.no-preview')}
                        </div>
                      </Show>
                    </CardContent>
                  </Card>
                );

                return (
                  <Show when={isCompleted() || meeting.status === 'failed'} fallback={<div class="block">{cardContent()}</div>}>
                    <A href={`/organizations/${params.organizationId}/meetings/${meeting.id}`} class="block">
                      {cardContent()}
                    </A>
                  </Show>
                );
              }}
            </For>
          </div>
        </Show>
      </Suspense>
    </div>
  );
};
