import type { Component } from 'solid-js';
import { useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createSignal, For, Show, Suspense } from 'solid-js';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Card, CardContent } from '@/modules/ui/components/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';
import { fetchAuditLog } from '../security-audit.services';

function formatTimestamp(ts: number) {
  return new Date(ts).toLocaleString();
}

function actionBadgeVariant(action: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (action.startsWith('auth.login_failed')) return 'destructive';
  if (action.includes('deleted')) return 'destructive';
  if (action.includes('downloaded')) return 'default';
  if (action.startsWith('auth.')) return 'secondary';
  return 'outline';
}

function shortenUserAgent(ua: string | null) {
  if (!ua) return '-';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('curl')) return 'curl';
  if (ua.length > 30) return `${ua.slice(0, 30)}...`;
  return ua;
}

const ACTION_FILTERS = [
  { value: '', label: 'All actions' },
  { value: 'document.downloaded', label: 'Document downloaded' },
  { value: 'document.created', label: 'Document created' },
  { value: 'document.deleted', label: 'Document deleted' },
  { value: 'auth.login', label: 'Login' },
  { value: 'auth.login_failed', label: 'Login failed' },
  { value: 'meeting.retranscribed', label: 'Meeting retranscribed' },
];

export const AuditLogPage: Component = () => {
  const params = useParams();
  const [pageIndex, setPageIndex] = createSignal(0);
  const [actionFilter, setActionFilter] = createSignal('');

  const query = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'audit-log', pageIndex(), actionFilter()],
    queryFn: () => fetchAuditLog({
      organizationId: params.organizationId,
      pageIndex: pageIndex(),
      pageSize: 50,
      action: actionFilter() || undefined,
    }),
  }));

  return (
    <div class="p-6 max-w-screen-lg mx-auto mt-4">
      <div class="border-b mb-6 pb-4">
        <h1 class="text-xl font-bold">Security Audit Log</h1>
        <p class="text-muted-foreground mt-1">
          Track who accessed what and when. All sensitive operations are logged.
        </p>
      </div>

      <div class="flex items-center gap-3 mb-4">
        <Select
          value={actionFilter()}
          onChange={v => { setActionFilter(v ?? ''); setPageIndex(0); }}
          options={ACTION_FILTERS.map(f => f.value)}
          itemComponent={props => (
            <SelectItem item={props.item}>
              {ACTION_FILTERS.find(f => f.value === props.item.rawValue)?.label ?? (props.item.rawValue || 'All actions')}
            </SelectItem>
          )}
        >
          <SelectTrigger class="w-56">
            <SelectValue<string>>
              {state => ACTION_FILTERS.find(f => f.value === state.selectedOption())?.label ?? 'All actions'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent />
        </Select>

        <span class="text-sm text-muted-foreground">
          {query.data?.totalCount ?? 0} entries
        </span>
      </div>

      <Suspense>
        <Show when={query.data?.entries?.length === 0}>
          <Card>
            <CardContent class="py-12 text-center text-muted-foreground">
              <div class="i-tabler-shield-check size-12 mx-auto mb-4 opacity-40" />
              <p>No audit log entries yet.</p>
              <p class="text-sm mt-1">Actions like document downloads and logins will appear here.</p>
            </CardContent>
          </Card>
        </Show>

        <Show when={(query.data?.entries?.length ?? 0) > 0}>
          <div class="border rounded-lg divide-y">
            <For each={query.data?.entries ?? []}>
              {entry => (
                <div class="px-4 py-3 flex items-center gap-3 text-sm">
                  <div class="flex-shrink-0">
                    <Badge variant={actionBadgeVariant(entry.action)} class="text-xs">
                      {entry.action}
                    </Badge>
                  </div>

                  <div class="flex-1 min-w-0">
                    <Show when={entry.resourceId}>
                      <span class="font-mono text-xs text-muted-foreground">{entry.resourceType}:{entry.resourceId}</span>
                    </Show>
                    <Show when={entry.details}>
                      <span class="text-muted-foreground ml-2">
                        {entry.details && typeof entry.details === 'object' && 'documentName' in entry.details
                          ? String(entry.details.documentName)
                          : ''}
                      </span>
                    </Show>
                  </div>

                  <div class="flex items-center gap-3 flex-shrink-0 text-xs text-muted-foreground">
                    <span title={entry.ipAddress ?? ''}>{entry.ipAddress ?? '-'}</span>
                    <span title={entry.userAgent ?? ''}>{shortenUserAgent(entry.userAgent)}</span>
                    <span class="w-36 text-right">{formatTimestamp(entry.createdAt)}</span>
                  </div>
                </div>
              )}
            </For>
          </div>

          <div class="flex justify-center gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={pageIndex() === 0}
              onClick={() => setPageIndex(p => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <span class="text-sm text-muted-foreground self-center">
              Page {pageIndex() + 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={(query.data?.entries?.length ?? 0) < 50}
              onClick={() => setPageIndex(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </Show>
      </Suspense>
    </div>
  );
};
