import type { Component } from 'solid-js';
import { A, useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createSignal, For, Show, Suspense } from 'solid-js';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Card, CardContent } from '@/modules/ui/components/card';
import { apiClient } from '@/modules/shared/http/api-client';

type IntakeEmailLogEntry = {
  id: string;
  createdAt: number;
  fromAddress: string;
  subject: string;
  attachmentsCount: number;
  status: string;
  errorMessage: string | null;
  documentIds: string[];
};

function formatDate(ts: number | string) {
  return new Date(ts).toLocaleString();
}

function statusBadge(status: string) {
  if (status === 'success') return { label: 'Success', variant: 'default' as const };
  if (status === 'partial') return { label: 'Partial', variant: 'secondary' as const };
  return { label: 'Failed', variant: 'destructive' as const };
}

export const IntakeEmailLogPage: Component = () => {
  const params = useParams();
  const [pageIndex, setPageIndex] = createSignal(0);

  const query = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'intake-email-log', pageIndex()],
    queryFn: () => apiClient<{ entries: IntakeEmailLogEntry[]; totalCount: number }>({
      method: 'GET',
      path: `/api/organizations/${params.organizationId}/intake-emails/log`,
      query: { pageIndex: pageIndex(), pageSize: 50 },
    }),
  }));

  return (
    <div class="p-4 sm:p-6 max-w-screen-lg mx-auto mt-2 sm:mt-4">
      <div class="border-b mb-4 sm:mb-6 pb-4">
        <h1 class="text-lg sm:text-xl font-bold">Intake Email Log</h1>
        <p class="text-sm text-muted-foreground mt-1">
          Track emails received via intake. Shows sender, subject, attachments, and processing status.
        </p>
      </div>

      <Suspense>
        <Show when={(query.data?.entries?.length ?? 0) === 0 && pageIndex() === 0}>
          <Card>
            <CardContent class="py-12 text-center text-muted-foreground">
              <div class="i-tabler-mail size-12 mx-auto mb-4 opacity-40" />
              <p>No intake emails received yet.</p>
              <p class="text-sm mt-1">Emails forwarded to your intake address will appear here.</p>
            </CardContent>
          </Card>
        </Show>

        <Show when={(query.data?.entries?.length ?? 0) > 0}>
          <div class="text-sm text-muted-foreground mb-3">
            {query.data?.totalCount ?? 0} emails received
          </div>

          <div class="border rounded-lg divide-y">
            <For each={query.data?.entries ?? []}>
              {entry => {
                const badge = statusBadge(entry.status);
                return (
                  <div class="px-3 sm:px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <div class="flex items-center gap-2 min-w-0 flex-1">
                      <div class="i-tabler-mail size-5 flex-shrink-0 text-muted-foreground" />
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="text-sm font-medium truncate">{entry.subject || '(no subject)'}</span>
                          <Badge variant={badge.variant} class="text-xs">{badge.label}</Badge>
                        </div>
                        <div class="text-xs text-muted-foreground mt-0.5">
                          From: {entry.fromAddress}
                          {' '}&middot; {entry.attachmentsCount} attachment{entry.attachmentsCount !== 1 ? 's' : ''}
                          <span class="hidden sm:inline"> &middot; {formatDate(entry.createdAt)}</span>
                        </div>
                        <Show when={entry.errorMessage}>
                          <div class="text-xs text-red-500 mt-0.5 truncate">{entry.errorMessage}</div>
                        </Show>
                      </div>
                    </div>

                    <div class="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
                      <Show when={entry.documentIds.length > 0}>
                        <div class="flex gap-1">
                          <For each={entry.documentIds.slice(0, 3)}>
                            {docId => (
                              <A
                                href={`/organizations/${params.organizationId}/documents/${docId}`}
                                class="text-xs text-primary hover:underline font-mono"
                              >
                                {docId.slice(4, 12)}
                              </A>
                            )}
                          </For>
                          <Show when={entry.documentIds.length > 3}>
                            <span class="text-xs text-muted-foreground">+{entry.documentIds.length - 3}</span>
                          </Show>
                        </div>
                      </Show>
                      <span class="text-xs text-muted-foreground sm:hidden">{formatDate(entry.createdAt)}</span>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>

          <div class="flex justify-center gap-2 mt-4">
            <Button variant="outline" size="sm" disabled={pageIndex() === 0} onClick={() => setPageIndex(p => p - 1)}>
              Previous
            </Button>
            <span class="text-sm text-muted-foreground self-center">Page {pageIndex() + 1}</span>
            <Button variant="outline" size="sm" disabled={(query.data?.entries?.length ?? 0) < 50} onClick={() => setPageIndex(p => p + 1)}>
              Next
            </Button>
          </div>
        </Show>
      </Suspense>
    </div>
  );
};
