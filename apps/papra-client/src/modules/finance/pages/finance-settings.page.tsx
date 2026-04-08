import type { Component } from 'solid-js';
import type { FinanceCategory, FinanceCategoryRule, FinanceItem } from '../finance.types';
import { useParams } from '@solidjs/router';
import { useMutation, useQuery } from '@tanstack/solid-query';
import { createSignal, For, Show, Suspense } from 'solid-js';
import { queryClient } from '@/modules/shared/query/query-client';
import { Button } from '@/modules/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/ui/components/card';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
import {
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

  // Items (connections) state
  const [newPluggyItemId, setNewPluggyItemId] = createSignal('');
  const [newConnectorName, setNewConnectorName] = createSignal('');

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

  const createItemMutation = useMutation(() => ({
    mutationFn: () => createFinanceItem({
      organizationId: params.organizationId,
      pluggyItemId: newPluggyItemId(),
      connectorName: newConnectorName(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finance', 'items'] });
      createToast({ type: 'success', message: 'Connection added' });
      setNewPluggyItemId('');
      setNewConnectorName('');
    },
    onError: () => {
      createToast({ type: 'error', message: 'Failed to add connection' });
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

  const handleAddItem = () => {
    if (!newPluggyItemId().trim() || !newConnectorName().trim()) {
      createToast({ type: 'error', message: 'Fill in all connection fields' });
      return;
    }
    createItemMutation.mutate();
  };

  const handleAddRule = () => {
    if (!rulePattern().trim() || !ruleCategoryId()) {
      createToast({ type: 'error', message: 'Fill in pattern and category' });
      return;
    }
    createRuleMutation.mutate();
  };

  return (
    <div class="p-6 mt-4 pb-32 max-w-3xl mx-auto space-y-8">
      <Suspense>
        <h2 class="text-lg font-semibold">Finance Settings</h2>

        {/* Connected Items */}
        <section class="space-y-4">
          <h3 class="text-base font-medium">Connected Accounts</h3>

          <Show
            when={items().length > 0}
            fallback={
              <p class="text-sm text-muted-foreground">No connections yet.</p>
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

          {/* Add Connection Form */}
          <Card>
            <CardHeader>
              <CardTitle class="text-sm">Add Connection</CardTitle>
            </CardHeader>
            <CardContent class="space-y-3">
              <div class="space-y-1">
                <label class="text-sm font-medium">Pluggy Item ID</label>
                <TextFieldRoot>
                  <TextField
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    value={newPluggyItemId()}
                    onInput={e => setNewPluggyItemId(e.currentTarget.value)}
                  />
                </TextFieldRoot>
              </div>
              <div class="space-y-1">
                <label class="text-sm font-medium">Connector name</label>
                <TextFieldRoot>
                  <TextField
                    placeholder="e.g. Nubank, Itaú"
                    value={newConnectorName()}
                    onInput={e => setNewConnectorName(e.currentTarget.value)}
                  />
                </TextFieldRoot>
              </div>
              <Button onClick={handleAddItem} disabled={createItemMutation.isPending}>
                <div classList={{
                  'i-tabler-plus size-4 mr-2': !createItemMutation.isPending,
                  'i-tabler-loader-2 animate-spin size-4 mr-2': createItemMutation.isPending,
                }} />
                Add Connection
              </Button>
            </CardContent>
          </Card>
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
    </div>
  );
};
