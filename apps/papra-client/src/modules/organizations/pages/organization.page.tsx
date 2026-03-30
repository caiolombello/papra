import type { Component } from 'solid-js';
import { formatBytes } from '@corentinth/chisels';
import { A, useParams } from '@solidjs/router';
import { keepPreviousData, useQuery } from '@tanstack/solid-query';
import { createSignal, Show, Suspense } from 'solid-js';
import { useDocumentUpload } from '@/modules/documents/components/document-import-status.component';
import { DocumentUploadArea } from '@/modules/documents/components/document-upload-area.component';
import { createdAtColumn, DocumentsPaginatedList, standardActionsColumn, tagsColumn } from '@/modules/documents/components/documents-list.component';
import { fetchOrganizationDocuments, getOrganizationDocumentsStats } from '@/modules/documents/documents.services';
import { fetchMeetingStats } from '@/modules/meetings/meetings.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { Button } from '@/modules/ui/components/button';

export const OrganizationPage: Component = () => {
  const params = useParams();
  const { t } = useI18n();
  const [getPagination, setPagination] = createSignal({ pageIndex: 0, pageSize: 100 });

  const documentsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'documents', getPagination()],
    queryFn: () => fetchOrganizationDocuments({
      organizationId: params.organizationId,
      ...getPagination(),
    }),
    placeholderData: keepPreviousData,
  }));

  const statsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'documents', 'stats'],
    queryFn: () => getOrganizationDocumentsStats({ organizationId: params.organizationId }),
  }));

  const meetingStatsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'meetings', 'stats'],
    queryFn: () => fetchMeetingStats({ organizationId: params.organizationId }),
  }));

  const { promptImport } = useDocumentUpload();

  return (
    <div class="p-6 mt-4 pb-32 max-w-5xl mx-auto">
      <Suspense>
        {documentsQuery.data?.documents?.length === 0
          ? (
              <>
                <h2 class="text-xl font-bold ">
                  {t('organizations.details.no-documents.title')}
                </h2>

                <p class="text-muted-foreground mt-1 mb-6">
                  {t('organizations.details.no-documents.description')}
                </p>

                <DocumentUploadArea />

              </>
            )
          : (
              <>
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
                  <Button onClick={promptImport} class="h-auto items-start flex-col gap-3 py-4 px-5 text-left">
                    <div class="i-tabler-upload size-5" />
                    {t('organizations.details.upload-documents')}
                  </Button>

                  <A href={`/organizations/${params.organizationId}/meetings`} class="border rounded-lg py-4 px-5 flex flex-col gap-3 hover:bg-accent/30 transition-colors">
                    <div class="i-tabler-microphone size-5 text-primary" />
                    <span class="text-sm font-medium">Meetings</span>
                  </A>

                  <Show when={statsQuery.data?.organizationStats}>
                    {organizationStats => (
                      <>
                        <div class="border rounded-lg py-4 px-5 flex flex-col gap-1">
                          <span class="font-light text-2xl">{organizationStats().documentsCount}</span>
                          <span class="text-xs text-muted-foreground">{t('organizations.details.documents-count')}</span>
                        </div>

                        <div class="border rounded-lg py-4 px-5 flex flex-col gap-1">
                          <span class="font-light text-2xl">{formatBytes({ bytes: organizationStats().documentsSize, base: 1000 })}</span>
                          <span class="text-xs text-muted-foreground">{t('organizations.details.total-size')}</span>
                        </div>
                      </>
                    )}
                  </Show>
                </div>

                <Show when={meetingStatsQuery.data?.stats && meetingStatsQuery.data.stats.total > 0}>
                  <A
                    href={`/organizations/${params.organizationId}/meetings`}
                    class="flex items-center gap-4 border rounded-lg py-3 px-5 mb-8 hover:bg-accent/30 transition-colors"
                  >
                    <div class="i-tabler-microphone size-5 text-primary flex-shrink-0" />
                    <div class="flex-1 text-sm">
                      <span class="font-medium">{meetingStatsQuery.data!.stats.total} meetings</span>
                      <Show when={meetingStatsQuery.data!.stats.processing > 0}>
                        <span class="text-muted-foreground"> · {meetingStatsQuery.data!.stats.processing} transcribing</span>
                      </Show>
                    </div>
                    <div class="i-tabler-chevron-right size-4 text-muted-foreground" />
                  </A>
                </Show>

                <h2 class="text-lg font-semibold mb-4">
                  {t('organizations.details.latest-documents')}
                </h2>

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
