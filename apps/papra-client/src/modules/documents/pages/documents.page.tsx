import type { Component } from 'solid-js';
import { useParams } from '@solidjs/router';
import { keepPreviousData, useQuery } from '@tanstack/solid-query';
import { For, Show, Suspense } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { createParamSynchronizedPagination } from '@/modules/shared/pagination/query-synchronized-pagination';
import { createParamSynchronizedSignal } from '@/modules/shared/signals/params';
import { cn } from '@/modules/shared/style/cn';
import { useDebounce } from '@/modules/shared/utils/timing';
import { Button } from '@/modules/ui/components/button';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/ui/components/card';
import { Badge } from '@/modules/ui/components/badge';
import { RelativeTime } from '@/modules/i18n/components/RelativeTime';
import { A } from '@solidjs/router';
import { DocumentUploadArea } from '../components/document-upload-area.component';
import { createdAtColumn, DocumentsPaginatedList, standardActionsColumn, tagsColumn } from '../components/documents-list.component';
import { fetchOrganizationDocuments } from '../documents.services';
import { searchOrganizationContent } from '@/modules/search/search.services';

export const DocumentsPage: Component = () => {
  const params = useParams();
  const { t } = useI18n();
  const [getSearchQuery, setSearchQuery] = createParamSynchronizedSignal<string>({ paramKey: 'query', defaultValue: '' });
  const debouncedSearchQuery = useDebounce(getSearchQuery, 300);
  const [getPagination, setPagination] = createParamSynchronizedPagination();

  const documentsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'documents', getPagination(), debouncedSearchQuery()],
    queryFn: () => debouncedSearchQuery().length > 0
      ? searchOrganizationContent({
          organizationId: params.organizationId,
          searchQuery: debouncedSearchQuery(),
          scope: 'all',
          ...getPagination(),
        })
      : fetchOrganizationDocuments({
          organizationId: params.organizationId,
          searchQuery: debouncedSearchQuery(),
          ...getPagination(),
        }),
    placeholderData: keepPreviousData,
  }));

  return (
    <div class="p-6 mt-4 pb-32 max-w-5xl mx-auto">
      <Suspense>
        {(documentsQuery.data?.documents?.length ?? 0) === 0 && debouncedSearchQuery().length === 0
          ? (
              <>
                <h2 class="text-xl font-bold ">
                  {t('documents.list.no-documents.title')}
                </h2>

                <p class="text-muted-foreground mt-1 mb-6">
                  {t('documents.list.no-documents.description')}
                </p>

                <DocumentUploadArea />

              </>
            )
          : (
              <>
                <h2 class="text-lg font-semibold mb-4">
                  {t('documents.list.title')}
                </h2>

                <div class="flex items-center">
                  <TextFieldRoot class="max-w-md flex-1">
                    <TextField
                      type="search"
                      name="search"
                      placeholder={t('documents.list.search.placeholder')}
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
                      disabled={documentsQuery.isFetching}
                      onClick={() => setSearchQuery('')}
                      aria-label={documentsQuery.isFetching ? 'Loading' : 'Clear search'}
                    >
                      <div
                        class={cn('text-muted-foreground', documentsQuery.isFetching ? 'i-tabler-loader-2 animate-spin' : 'i-tabler-x')}
                      />
                    </Button>
                  </Show>

                </div>
                <div class="mb-4 text-sm text-muted-foreground mt-2 ml-2">
                  <Show
                    when={debouncedSearchQuery().length > 0}
                    fallback={t('documents.list.search.total-count-no-query', { count: documentsQuery.data?.documentsCount ?? 0 })}
                  >
                    {t('documents.list.search.total-count-with-query', { count: documentsQuery.data?.documentsCount ?? 0 })}
                  </Show>
                </div>

                <Show when={debouncedSearchQuery().length > 0 && ('meetings' in (documentsQuery.data ?? {})) && ((documentsQuery.data as any).meetings?.length ?? 0) > 0}>
                  <div class="mb-8">
                    <h3 class="text-base font-semibold mb-3">{t('documents.list.related-meetings.title')}</h3>
                    <div class="space-y-3">
                      <For each={(documentsQuery.data as any).meetings ?? []}>
                        {(meeting: any) => (
                          <A href={`/organizations/${params.organizationId}/meetings/${meeting.id}`} class="block">
                            <Card class="transition-colors hover:bg-accent/30">
                              <CardHeader class="gap-2">
                                <div class="flex items-start justify-between gap-4">
                                  <div class="min-w-0">
                                    <CardTitle class="text-base truncate">{meeting.title}</CardTitle>
                                    <CardDescription class="mt-1">
                                      <RelativeTime date={meeting.createdAt} />
                                    </CardDescription>
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
                              </CardHeader>
                              <CardContent>
                                <div class="text-sm leading-6 line-clamp-3">
                                  {meeting.matches?.[0]?.snippet || meeting.chunks?.[0]?.content || t('meetings.list.no-preview')}
                                </div>
                              </CardContent>
                            </Card>
                          </A>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                <Show when={debouncedSearchQuery().length > 0 && documentsQuery.data?.documents.length === 0}>
                  <p class="text-muted-foreground mt-1 mb-6">
                    {t('documents.list.no-results')}
                  </p>
                </Show>

                <DocumentsPaginatedList
                  documents={documentsQuery.data?.documents ?? []}
                  documentsCount={documentsQuery.data?.documentsCount ?? 0}
                  getPagination={getPagination}
                  setPagination={setPagination}
                  extraColumns={[
                    tagsColumn,
                    createdAtColumn,
                    standardActionsColumn,
                  ]}
                />
              </>
            )}
      </Suspense>
    </div>
  );
};
