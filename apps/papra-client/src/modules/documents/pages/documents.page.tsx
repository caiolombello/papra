import type { Component } from 'solid-js';
import { A, useParams, useSearchParams } from '@solidjs/router';
import { createMutation, keepPreviousData, useQuery } from '@tanstack/solid-query';
import { createSignal, For, Show, Suspense } from 'solid-js';
import { createFolder, fetchFolder, fetchFolders } from '@/modules/document-folders/document-folders.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { RelativeTime } from '@/modules/i18n/components/RelativeTime';
import { createParamSynchronizedPagination } from '@/modules/shared/pagination/query-synchronized-pagination';
import { createParamSynchronizedSignal } from '@/modules/shared/signals/params';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { useDebounce } from '@/modules/shared/utils/timing';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/ui/components/card';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
import { createToast } from '@/modules/ui/components/sonner';
import { searchOrganizationContent } from '@/modules/search/search.services';
import { DocumentUploadArea } from '../components/document-upload-area.component';
import { createdAtColumn, DocumentsPaginatedList, standardActionsColumn, tagsColumn } from '../components/documents-list.component';
import { fetchOrganizationDocuments, moveDocumentToFolder } from '../documents.services';

export const DocumentsPage: Component = () => {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useI18n();
  const [getSearchQuery, setSearchQuery] = createParamSynchronizedSignal<string>({ paramKey: 'query', defaultValue: '' });
  const debouncedSearchQuery = useDebounce(getSearchQuery, 300);
  const [getPagination, setPagination] = createParamSynchronizedPagination();

  const currentFolderId = () => searchParams.folderId as string | undefined;
  const isInFolder = () => Boolean(currentFolderId());

  const foldersQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'folders', currentFolderId() ?? 'root'],
    queryFn: () => fetchFolders({ organizationId: params.organizationId, parentId: currentFolderId() ?? null }),
    enabled: !debouncedSearchQuery(),
  }));

  const folderDetailQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'folders', currentFolderId(), 'detail'],
    queryFn: () => fetchFolder({ organizationId: params.organizationId, folderId: currentFolderId()! }),
    enabled: Boolean(currentFolderId()),
  }));

  const [showNewFolder, setShowNewFolder] = createSignal(false);
  const [newFolderName, setNewFolderName] = createSignal('');

  const createFolderMutation = createMutation(() => ({
    mutationFn: () => createFolder({
      organizationId: params.organizationId,
      name: newFolderName(),
      parentId: currentFolderId() ?? null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'folders'] });
      setShowNewFolder(false);
      setNewFolderName('');
    },
  }));

  const navigateToFolder = (folderId: string | null) => {
    if (folderId) {
      setSearchParams({ folderId });
    } else {
      setSearchParams({ folderId: undefined });
    }
  };

  const documentsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'documents', getPagination(), debouncedSearchQuery(), currentFolderId()],
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
          folderId: currentFolderId() ?? 'root',
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

                  <Button variant="outline" size="sm" class="ml-2" onClick={() => setShowNewFolder(true)}>
                    <div class="i-tabler-folder-plus size-4 mr-1" />
                    New Folder
                  </Button>
                </div>

                {/* Breadcrumb */}
                <Show when={isInFolder() && folderDetailQuery.data}>
                  <div class="flex items-center gap-1 text-sm mt-3 mb-2">
                    <button class="text-primary hover:underline" onClick={() => navigateToFolder(null)}>Documents</button>
                    <For each={folderDetailQuery.data?.path ?? []}>
                      {(crumb, index) => (
                        <>
                          <span class="text-muted-foreground">/</span>
                          <Show
                            when={index() < (folderDetailQuery.data?.path.length ?? 0) - 1}
                            fallback={<span class="font-medium">{crumb.name}</span>}
                          >
                            <button class="text-primary hover:underline" onClick={() => navigateToFolder(crumb.id)}>{crumb.name}</button>
                          </Show>
                        </>
                      )}
                    </For>
                  </div>
                </Show>

                {/* New folder input */}
                <Show when={showNewFolder()}>
                  <div class="flex items-center gap-2 mt-2 mb-2">
                    <TextFieldRoot class="flex-1 max-w-xs">
                      <TextField
                        placeholder="Folder name"
                        value={newFolderName()}
                        onInput={e => setNewFolderName(e.currentTarget.value)}
                        onKeyDown={e => e.key === 'Enter' && newFolderName().trim() && createFolderMutation.mutate()}
                        autofocus
                      />
                    </TextFieldRoot>
                    <Button size="sm" onClick={() => createFolderMutation.mutate()} disabled={!newFolderName().trim() || createFolderMutation.isPending}>
                      Create
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}>
                      Cancel
                    </Button>
                  </div>
                </Show>

                {/* Subfolders */}
                <Show when={!debouncedSearchQuery() && (foldersQuery.data?.folders?.length ?? 0) > 0}>
                  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-3 mb-4">
                    <For each={foldersQuery.data?.folders ?? []}>
                      {folder => {
                        const [isDragOver, setIsDragOver] = createSignal(false);
                        return (
                          <button
                            class={cn(
                              'flex items-center gap-2 px-3 py-2 rounded-lg border bg-card hover:bg-accent/30 transition-colors text-left',
                              isDragOver() && 'ring-2 ring-primary bg-primary/10',
                            )}
                            onClick={() => navigateToFolder(folder.id)}
                            onDragOver={(e) => {
                              e.preventDefault();
                              if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                              setIsDragOver(true);
                            }}
                            onDragLeave={() => setIsDragOver(false)}
                            onDrop={async (e) => {
                              e.preventDefault();
                              setIsDragOver(false);
                              const docId = e.dataTransfer?.getData('application/x-papra-document-id');
                              if (docId) {
                                await moveDocumentToFolder({ documentId: docId, organizationId: params.organizationId, folderId: folder.id });
                                await queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'documents'] });
                                createToast({ type: 'success', message: `Moved to ${folder.name}` });
                              }
                            }}
                          >
                            <div class={cn('size-5', isDragOver() ? 'i-tabler-folder-open text-primary' : 'i-tabler-folder text-primary')} />
                            <span class="text-sm font-medium truncate">{folder.name}</span>
                          </button>
                        );
                      }}
                    </For>
                  </div>
                </Show>

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
