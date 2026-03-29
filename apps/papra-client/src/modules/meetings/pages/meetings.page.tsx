import type { Component } from 'solid-js';
import { A, useParams } from '@solidjs/router';
import { keepPreviousData, useQuery } from '@tanstack/solid-query';
import { For, Show, Suspense } from 'solid-js';
import { RelativeTime } from '@/modules/i18n/components/RelativeTime';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { createParamSynchronizedPagination } from '@/modules/shared/pagination/query-synchronized-pagination';
import { createParamSynchronizedSignal } from '@/modules/shared/signals/params';
import { cn } from '@/modules/shared/style/cn';
import { useDebounce } from '@/modules/shared/utils/timing';
import { Badge } from '@/modules/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/ui/components/card';
import { EmptyState } from '@/modules/ui/components/empty';
import { Button } from '@/modules/ui/components/button';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
import { fetchOrganizationMeetings, searchOrganizationMeetings } from '../meetings.services';

export const MeetingsPage: Component = () => {
  const params = useParams();
  const { t } = useI18n();
  const [getSearchQuery, setSearchQuery] = createParamSynchronizedSignal<string>({ paramKey: 'query', defaultValue: '' });
  const debouncedSearchQuery = useDebounce(getSearchQuery, 300);
  const [getPagination, setPagination] = createParamSynchronizedPagination();

  const meetingsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'meetings', getPagination(), debouncedSearchQuery()],
    queryFn: () => debouncedSearchQuery().length > 0
      ? searchOrganizationMeetings({
          organizationId: params.organizationId,
          searchQuery: debouncedSearchQuery(),
          ...getPagination(),
        })
      : fetchOrganizationMeetings({
          organizationId: params.organizationId,
          ...getPagination(),
        }),
    placeholderData: keepPreviousData,
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
              {meeting => (
                <A href={`/organizations/${params.organizationId}/meetings/${meeting.id}`} class="block">
                  <Card class="transition-colors hover:bg-accent/30">
                    <CardHeader class="gap-3">
                      <div class="flex items-start justify-between gap-4">
                        <div class="min-w-0">
                          <CardTitle class="text-base truncate">{meeting.title}</CardTitle>
                          <CardDescription class="mt-1">
                            <RelativeTime date={meeting.createdAt} />
                          </CardDescription>
                        </div>
                        <div class="flex flex-wrap items-center gap-2 justify-end">
                          <Show when={meeting.context}>
                            <Badge variant="secondary">{meeting.context}</Badge>
                          </Show>
                          <Show when={meeting.language}>
                            <Badge variant="outline">{meeting.language}</Badge>
                          </Show>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent class="space-y-2">
                      <Show when={meeting.sourceName}>
                        <div class="text-sm text-muted-foreground truncate">{meeting.sourceName}</div>
                      </Show>
                      <div class="text-sm leading-6 line-clamp-4">
                        {meeting.matches?.[0]?.snippet || meeting.summary || meeting.chunks?.[0]?.content || t('meetings.list.no-preview')}
                      </div>
                    </CardContent>
                  </Card>
                </A>
              )}
            </For>
          </div>
        </Show>
      </Suspense>
    </div>
  );
};
