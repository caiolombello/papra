import type { Component } from 'solid-js';
import { useParams } from '@solidjs/router';
import { createMutation, useQuery, useQueryClient } from '@tanstack/solid-query';
import { For, Show, Suspense } from 'solid-js';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Card, CardContent } from '@/modules/ui/components/card';
import { createToast } from '@/modules/ui/components/sonner';
import { listShareLinks, revokeShareLink } from '../share-links.services';

function formatDate(ts: number | string) {
  return new Date(ts).toLocaleString();
}

function timeUntil(ts: number | string) {
  const diff = new Date(ts).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h left`;
  if (hours > 0) return `${hours}h left`;
  const minutes = Math.floor(diff / (1000 * 60));
  return `${minutes}m left`;
}

function isLinkActive(link: { isRevoked: boolean; isExpired?: boolean; isMaxViewsReached?: boolean }) {
  return !link.isRevoked && !link.isExpired && !link.isMaxViewsReached;
}

function getLinkStatus(link: { isRevoked: boolean; isExpired?: boolean; isMaxViewsReached?: boolean }) {
  if (link.isRevoked) return { label: 'Revoked', variant: 'destructive' as const };
  if (link.isExpired) return { label: 'Expired', variant: 'secondary' as const };
  if (link.isMaxViewsReached) return { label: 'Max views', variant: 'secondary' as const };
  return { label: 'Active', variant: 'default' as const };
}

export const ShareLinksManagementPage: Component = () => {
  const params = useParams();
  const queryClient = useQueryClient();

  const query = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'share-links'],
    queryFn: () => listShareLinks({ organizationId: params.organizationId }),
  }));

  const revokeMutation = createMutation(() => ({
    mutationFn: (shareLinkId: string) => revokeShareLink({ organizationId: params.organizationId, shareLinkId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'share-links'] });
      createToast({ type: 'success', message: 'Share link revoked' });
    },
    onError: () => {
      createToast({ type: 'error', message: 'Failed to revoke share link' });
    },
  }));

  const activeLinks = () => (query.data?.links ?? []).filter(isLinkActive);
  const inactiveLinks = () => (query.data?.links ?? []).filter(l => !isLinkActive(l));

  return (
    <div class="p-6 max-w-screen-lg mx-auto mt-4">
      <div class="border-b mb-6 pb-4">
        <h1 class="text-xl font-bold">Shared Links</h1>
        <p class="text-muted-foreground mt-1">
          Manage shared links to documents and meetings. Revoke access at any time.
        </p>
      </div>

      <Suspense>
        <Show when={(query.data?.links?.length ?? 0) === 0}>
          <Card>
            <CardContent class="py-12 text-center text-muted-foreground">
              <div class="i-tabler-share size-12 mx-auto mb-4 opacity-40" />
              <p>No shared links yet.</p>
              <p class="text-sm mt-1">Share a document or meeting to create a link.</p>
            </CardContent>
          </Card>
        </Show>

        <Show when={activeLinks().length > 0}>
          <h2 class="text-sm font-medium text-muted-foreground mb-3">Active ({activeLinks().length})</h2>
          <div class="border rounded-lg divide-y mb-6">
            <For each={activeLinks()}>
              {link => {
                const status = getLinkStatus(link);
                return (
                  <div class="px-4 py-3 flex items-center gap-3">
                    <div class={`size-5 flex-shrink-0 ${link.resourceType === 'meeting' ? 'i-tabler-microphone' : 'i-tabler-file-text'} text-muted-foreground`} />

                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="font-mono text-xs text-muted-foreground">{link.resourceType}:{link.resourceId}</span>
                        <Badge variant={status.variant} class="text-xs">{status.label}</Badge>
                        <Show when={link.hasPassword}>
                          <div class="i-tabler-lock size-3.5 text-muted-foreground" title="Password protected" />
                        </Show>
                      </div>
                      <div class="text-xs text-muted-foreground mt-1">
                        {link.viewCount} views
                        <Show when={link.maxViews !== null}> / {link.maxViews} max</Show>
                        {' '}&middot; {timeUntil(link.expiresAt)}
                        {' '}&middot; Created {formatDate(link.createdAt)}
                      </div>
                    </div>

                    <div class="flex gap-2 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const url = `${window.location.origin}/share/${link.token}`;
                          navigator.clipboard.writeText(url);
                          createToast({ type: 'success', message: 'Link copied' });
                        }}
                      >
                        <div class="i-tabler-copy size-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => revokeMutation.mutate(link.id)}
                        disabled={revokeMutation.isPending}
                      >
                        Revoke
                      </Button>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>

        <Show when={inactiveLinks().length > 0}>
          <h2 class="text-sm font-medium text-muted-foreground mb-3">Expired / Revoked ({inactiveLinks().length})</h2>
          <div class="border rounded-lg divide-y opacity-60">
            <For each={inactiveLinks()}>
              {link => {
                const status = getLinkStatus(link);
                return (
                  <div class="px-4 py-3 flex items-center gap-3">
                    <div class={`size-5 flex-shrink-0 ${link.resourceType === 'meeting' ? 'i-tabler-microphone' : 'i-tabler-file-text'} text-muted-foreground`} />
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="font-mono text-xs text-muted-foreground">{link.resourceType}:{link.resourceId}</span>
                        <Badge variant={status.variant} class="text-xs">{status.label}</Badge>
                      </div>
                      <div class="text-xs text-muted-foreground mt-1">
                        {link.viewCount} views &middot; Created {formatDate(link.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </Suspense>
    </div>
  );
};
