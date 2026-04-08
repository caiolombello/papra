import type { Component } from 'solid-js';
import type { FinanceCategory, FinanceCategoryRule, FinanceItem } from '../finance.types';
import { useParams } from '@solidjs/router';
import { useMutation, useQuery } from '@tanstack/solid-query';
import { createSignal, For, onCleanup, onMount, Show, Suspense } from 'solid-js';
import { queryClient } from '@/modules/shared/query/query-client';
import { Button } from '@/modules/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/ui/components/card';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
import {
  createConnectToken,
  createFinanceCategoryRule,
  createFinanceItem,
  deleteFinanceCategoryRule,
  fetchFinanceCategories,
  fetchFinanceItems,
  triggerFinanceSync,
} from '../finance.services';

function formatDate(date: Date | string | null) {
  if (!date) return 'Never';
  return new Date(date).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusColor(status: string) {
  switch (status.toLowerCase()) {
    case 'updated':
    case 'active':
      return 'text-green-600';
    case 'updating':
      return 'text-amber-600';
    case 'error':
    case 'login_error':
      return 'text-red-600';
    default:
      return 'text-muted-foreground';
  }
}

export const FinanceSettingsPage: Component = () => {
  const params = useParams();

  // Widget state
  const [showWidget, setShowWidget] = createSignal(false);
  const [connectToken, setConnectToken] = createSignal('');
  const [connectingBank, setConnectingBank] = createSignal(false);

  // Category rule state
  const [rulePattern, setRulePattern] = createSignal('');
  const [ruleField, setRuleField] = createSignal<string>('description');
  const [ruleCategoryId, setRuleCategoryId] = createSignal('');
  const [rulePriority, setRulePriority] = createSignal('10');

  const itemsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'finance', 'items'],
    queryFn: () => fetchFinanceItems({ organizationId: params.organizationId }),
  }));

  const categoriesQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'finance', 'categories'],
    queryFn: () => fetchFinanceCategories({ organizationId: params.organizationId }),
  }));

  const syncMutation = useMutation(() => ({
    mutationFn: (itemId?: string) => triggerFinanceSync({ organizationId: params.organizationId, itemId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finance', 'items'] });
      createToast({ type: 'success', message: 'Sync triggered' });
    },
    onError: () => {
      createToast({ type: 'error', message: 'Failed to trigger sync' });
    },
  }));

  const createRuleMutation = useMutation(() => ({
    mutationFn: () => createFinanceCategoryRule({
      organizationId: params.organizationId,
      pattern: rulePattern(),
      field: ruleField(),
      categoryId: ruleCategoryId(),
      priority: parseInt(rulePriority(), 10) || 10,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finance', 'categories'] });
      createToast({ type: 'success', message: 'Rule created' });
      setRulePattern('');
      setRuleCategoryId('');
      setRulePriority('10');
    },
    onError: () => {
      createToast({ type: 'error', message: 'Failed to create rule' });
    },
  }));

  const deleteRuleMutation = useMutation(() => ({
    mutationFn: (ruleId: string) => deleteFinanceCategoryRule({ organizationId: params.organizationId, ruleId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finance', 'categories'] });
      createToast({ type: 'success', message: 'Rule deleted' });
    },
    onError: () => {
      createToast({ type: 'error', message: 'Failed to delete rule' });
    },
  }));

  const items = () => itemsQuery.data?.items ?? [];
  const categories = () => categoriesQuery.data?.categories ?? [];
  const rules = () => categoriesQuery.data?.rules ?? [];

  const getCategoryName = (categoryId: string) =>
    categories().find((c: FinanceCategory) => c.id === categoryId)?.name ?? categoryId;

  const handleConnectBank = async () => {
    try {
      setConnectingBank(true);
      const result = await createConnectToken({ organizationId: params.organizationId });
      setConnectToken(result.accessToken);
      setShowWidget(true);
    } catch {
      createToast({ type: 'error', message: 'Failed to create connect token' });
    } finally {
      setConnectingBank(false);
    }
  };

  const handleAddRule = () => {
    if (!rulePattern().trim() || !ruleCategoryId()) {
      createToast({ type: 'error', message: 'Fill in pattern and category' });
      return;
    }
    createRuleMutation.mutate();
  };

  onMount(() => {
    const handler = async (event: MessageEvent) => {
      if (event.origin !== 'https://connect.pluggy.ai') return;

      const data = event.data;
      if (!data || typeof data !== 'object') return;

      // Handle both possible message formats from the widget
      const itemData = data.item || data.data?.item;
      if (itemData?.id) {
        try {
          await createFinanceItem({
            organizationId: params.organizationId,
            pluggyItemId: itemData.id,
            connectorName: itemData.connector?.name || 'Banco',
          });

          await triggerFinanceSync({ organizationId: params.organizationId });

          queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finance'] });
          queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finance', 'items'] });
          createToast({ type: 'success', message: 'Banco conectado com sucesso!' });
          setShowWidget(false);
        } catch {
          createToast({ type: 'error', message: 'Erro ao registrar conexão' });
        }
      }

      // Handle close event
      if (data.event === 'close' || data.action === 'closed') {
        setShowWidget(false);
      }
    };

    window.addEventListener('message', handler);
    onCleanup(() => window.removeEventListener('message', handler));
  });

  return (
    <div class="p-6 mt-4 pb-32 max-w-3xl mx-auto space-y-8">
      <Suspense>
        <h2 class="text-lg font-semibold">Finance Settings</h2>

        {/* Connected Banks */}
        <section class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-base font-medium">Connected Accounts</h3>
            <div class="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncMutation.mutate(undefined)}
                disabled={syncMutation.isPending}
              >
                <div classList={{
                  'i-tabler-refresh size-4 mr-2': true,
                  'animate-spin': syncMutation.isPending,
                }} />
                Sync All
              </Button>
              <Button
                size="sm"
                onClick={handleConnectBank}
                disabled={connectingBank()}
              >
                <div classList={{
                  'i-tabler-plus size-4 mr-2': !connectingBank(),
                  'i-tabler-loader-2 animate-spin size-4 mr-2': connectingBank(),
                }} />
                Connect New Bank
              </Button>
            </div>
          </div>

          <Show
            when={items().length > 0}
            fallback={
              <p class="text-sm text-muted-foreground">No connections yet. Click "Connect New Bank" to get started.</p>
            }
          >
            <div class="space-y-3">
              <For each={items()}>
                {(item: FinanceItem) => (
                  <Card>
                    <CardContent class="flex items-center justify-between gap-4 py-4">
                      <div class="min-w-0">
                        <p class="font-medium truncate">{item.connectorName}</p>
                        <p class="text-xs text-muted-foreground mt-0.5 font-mono">{item.pluggyItemId}</p>
                        <div class="flex items-center gap-3 mt-1 text-xs">
                          <span classList={{ [statusColor(item.status)]: true, 'font-medium': true }}>
                            {item.status}
                          </span>
                          <span class="text-muted-foreground">
                            Last sync: {formatDate(item.lastSyncAt)}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => syncMutation.mutate(item.id)}
                        disabled={syncMutation.isPending}
                      >
                        <div classList={{
                          'i-tabler-refresh size-4 mr-2': true,
                          'animate-spin': syncMutation.isPending,
                        }} />
                        Sync
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </For>
            </div>
          </Show>
        </section>

        {/* Category Rules */}
        <section class="space-y-4">
          <h3 class="text-base font-medium">Category Rules</h3>
          <p class="text-sm text-muted-foreground">
            Automatically categorize transactions that match a pattern in the description or merchant name.
          </p>

          <Show when={rules().length > 0}>
            <Card>
              <CardContent class="p-0">
                <table class="w-full text-sm">
                  <thead class="border-b">
                    <tr class="text-left text-muted-foreground">
                      <th class="px-4 py-3 font-medium">Pattern</th>
                      <th class="px-4 py-3 font-medium">Field</th>
                      <th class="px-4 py-3 font-medium">Category</th>
                      <th class="px-4 py-3 font-medium text-center">Priority</th>
                      <th class="px-4 py-3 font-medium sr-only">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={rules()}>
                      {(rule: FinanceCategoryRule) => (
                        <tr class="border-b last:border-0 hover:bg-muted/40 transition-colors">
                          <td class="px-4 py-3 font-mono text-xs">{rule.pattern}</td>
                          <td class="px-4 py-3 text-muted-foreground">{rule.field}</td>
                          <td class="px-4 py-3">{getCategoryName(rule.categoryId)}</td>
                          <td class="px-4 py-3 text-center text-muted-foreground">{rule.priority}</td>
                          <td class="px-4 py-3">
                            <Button
                              variant="ghost"
                              size="icon"
                              class="size-7 text-muted-foreground hover:text-red-500"
                              onClick={() => deleteRuleMutation.mutate(rule.id)}
                              disabled={deleteRuleMutation.isPending}
                            >
                              <div class="i-tabler-trash size-3.5" />
                            </Button>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </Show>

          {/* Add Rule Form */}
          <Card>
            <CardHeader>
              <CardTitle class="text-sm">Add Rule</CardTitle>
            </CardHeader>
            <CardContent class="space-y-3">
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div class="space-y-1">
                  <label class="text-sm font-medium">Pattern</label>
                  <TextFieldRoot>
                    <TextField
                      placeholder="NETFLIX, iFood, etc."
                      value={rulePattern()}
                      onInput={e => setRulePattern(e.currentTarget.value)}
                    />
                  </TextFieldRoot>
                </div>

                <div class="space-y-1">
                  <label class="text-sm font-medium">Match field</label>
                  <select
                    class="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    value={ruleField()}
                    onChange={e => setRuleField(e.currentTarget.value)}
                  >
                    <option value="description">Description</option>
                    <option value="merchantName">Merchant name</option>
                  </select>
                </div>

                <div class="space-y-1">
                  <label class="text-sm font-medium">Category</label>
                  <select
                    class="w-full border rounded-md px-3 py-2 text-sm bg-background"
                    value={ruleCategoryId()}
                    onChange={e => setRuleCategoryId(e.currentTarget.value)}
                  >
                    <option value="">Select category...</option>
                    <For each={categories()}>
                      {(cat: FinanceCategory) => (
                        <option value={cat.id}>{cat.name}</option>
                      )}
                    </For>
                  </select>
                </div>

                <div class="space-y-1">
                  <label class="text-sm font-medium">Priority</label>
                  <TextFieldRoot>
                    <TextField
                      type="number"
                      placeholder="10"
                      value={rulePriority()}
                      onInput={e => setRulePriority(e.currentTarget.value)}
                      min="1"
                    />
                  </TextFieldRoot>
                </div>
              </div>

              <Button onClick={handleAddRule} disabled={createRuleMutation.isPending}>
                <div classList={{
                  'i-tabler-plus size-4 mr-2': !createRuleMutation.isPending,
                  'i-tabler-loader-2 animate-spin size-4 mr-2': createRuleMutation.isPending,
                }} />
                Add Rule
              </Button>
            </CardContent>
          </Card>
        </section>
      </Suspense>

      {/* Pluggy Connect Widget Overlay */}
      <Show when={showWidget()}>
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowWidget(false)}
        >
          <div
            class="relative w-full max-w-lg h-[600px] bg-background rounded-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              class="absolute right-2 top-2 z-10"
              onClick={() => setShowWidget(false)}
            >
              <div class="i-tabler-x size-5" />
            </Button>
            <iframe
              src={`https://connect.pluggy.ai?connect_token=${connectToken()}`}
              class="w-full h-full border-0"
              allow="clipboard-write"
            />
          </div>
        </div>
      </Show>
    </div>
  );
};
