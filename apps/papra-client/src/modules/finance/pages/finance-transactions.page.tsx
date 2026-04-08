import type { Component } from 'solid-js';
import type { FinanceCategory, FinanceTransaction } from '../finance.types';
import { useParams } from '@solidjs/router';
import { useMutation, useQuery } from '@tanstack/solid-query';
import { createSignal, For, Show, Suspense } from 'solid-js';
import { queryClient } from '@/modules/shared/query/query-client';
import { Button } from '@/modules/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/ui/components/card';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
import { fetchFinanceCategories, fetchFinanceTransactions, updateTransactionCategory } from '../finance.services';
import { useFinancialMonth } from '../composables/use-financial-month';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const PAGE_SIZE = 25;

export const FinanceTransactionsPage: Component = () => {
  const params = useParams();
  const { financialMonth, formatFinancialMonth, navigateMonth } = useFinancialMonth();

  const [search, setSearch] = createSignal('');
  const [accountId, setAccountId] = createSignal('');
  const [typeFilter, setTypeFilter] = createSignal('');
  const [pageIndex, setPageIndex] = createSignal(0);
  const [recategorizeId, setRecategorizeId] = createSignal<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = createSignal<string>('');

  const transactionsQuery = useQuery(() => ({
    queryKey: [
      'organizations', params.organizationId, 'finance', 'transactions',
      financialMonth(), search(), accountId(), typeFilter(), pageIndex(),
    ],
    queryFn: () => fetchFinanceTransactions({
      organizationId: params.organizationId,
      pageIndex: pageIndex(),
      pageSize: PAGE_SIZE,
      financialMonth: financialMonth(),
      search: search() || undefined,
      accountId: accountId() || undefined,
      type: typeFilter() || undefined,
    }),
  }));

  const categoriesQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'finance', 'categories'],
    queryFn: () => fetchFinanceCategories({ organizationId: params.organizationId }),
  }));

  const updateCategoryMutation = useMutation(() => ({
    mutationFn: ({ transactionId, categoryId }: { transactionId: string; categoryId: string | null }) =>
      updateTransactionCategory({ organizationId: params.organizationId, transactionId, categoryId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finance', 'transactions'] });
      createToast({ type: 'success', message: 'Category updated' });
      setRecategorizeId(null);
    },
    onError: () => {
      createToast({ type: 'error', message: 'Failed to update category' });
    },
  }));

  const transactions = () => transactionsQuery.data?.transactions ?? [];
  const total = () => transactionsQuery.data?.total ?? 0;
  const totalPages = () => Math.ceil(total() / PAGE_SIZE);
  const categories = () => categoriesQuery.data?.categories ?? [];

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return '—';
    return categories().find((c: FinanceCategory) => c.id === categoryId)?.name ?? categoryId;
  };

  return (
    <div class="p-6 mt-4 pb-32 max-w-6xl mx-auto">
      <Suspense>
        {/* Month Navigator */}
        <div class="flex items-center gap-2 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigateMonth(-1)} aria-label="Previous month">
            <div class="i-tabler-chevron-left size-4" />
          </Button>
          <span class="text-sm font-medium min-w-48 text-center">
            {formatFinancialMonth(financialMonth())}
          </span>
          <Button variant="ghost" size="icon" onClick={() => navigateMonth(1)} aria-label="Next month">
            <div class="i-tabler-chevron-right size-4" />
          </Button>
        </div>

        {/* Filters */}
        <div class="flex flex-wrap gap-3 mb-6">
          <TextFieldRoot class="max-w-xs flex-1">
            <TextField
              type="search"
              placeholder="Search transactions..."
              value={search()}
              onInput={e => { setSearch(e.currentTarget.value); setPageIndex(0); }}
            />
          </TextFieldRoot>

          <select
            class="border rounded-md px-3 py-2 text-sm bg-background"
            value={typeFilter()}
            onChange={e => { setTypeFilter(e.currentTarget.value); setPageIndex(0); }}
          >
            <option value="">All types</option>
            <option value="DEBIT">Debit</option>
            <option value="CREDIT">Credit</option>
          </select>
        </div>

        {/* Summary */}
        <p class="text-sm text-muted-foreground mb-4">
          {total()} transaction{total() !== 1 ? 's' : ''}
        </p>

        <Card>
          <CardHeader>
            <CardTitle class="text-base">Transactions</CardTitle>
          </CardHeader>
          <CardContent class="p-0">
            <Show
              when={transactions().length > 0}
              fallback={
                <div class="text-center py-12 text-muted-foreground text-sm">
                  No transactions found for this period
                </div>
              }
            >
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead class="border-b">
                    <tr class="text-left text-muted-foreground">
                      <th class="px-4 py-3 font-medium">Date</th>
                      <th class="px-4 py-3 font-medium">Description</th>
                      <th class="px-4 py-3 font-medium text-right">Amount</th>
                      <th class="px-4 py-3 font-medium">Category</th>
                      <th class="px-4 py-3 font-medium">Installment</th>
                      <th class="px-4 py-3 font-medium sr-only">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={transactions()}>
                      {(txn: FinanceTransaction) => (
                        <tr class="border-b last:border-0 hover:bg-muted/40 transition-colors">
                          <td class="px-4 py-3 whitespace-nowrap text-muted-foreground">
                            {formatDate(txn.date)}
                          </td>
                          <td class="px-4 py-3 max-w-xs">
                            <p class="truncate font-medium">{txn.merchantName ?? txn.description}</p>
                            <Show when={txn.merchantName && txn.description !== txn.merchantName}>
                              <p class="text-xs text-muted-foreground truncate">{txn.description}</p>
                            </Show>
                          </td>
                          <td
                            class="px-4 py-3 text-right font-semibold whitespace-nowrap"
                            classList={{
                              'text-red-600': txn.type === 'DEBIT',
                              'text-green-600': txn.type === 'CREDIT',
                            }}
                          >
                            {txn.type === 'DEBIT' ? '-' : '+'}{formatCurrency(txn.amount)}
                          </td>
                          <td class="px-4 py-3">
                            <Show
                              when={recategorizeId() === txn.id}
                              fallback={
                                <span
                                  class="text-xs px-2 py-1 rounded bg-muted cursor-pointer hover:bg-accent transition-colors"
                                  onClick={() => { setRecategorizeId(txn.id); setSelectedCategoryId(txn.categoryId ?? ''); }}
                                >
                                  {getCategoryName(txn.categoryId)}
                                </span>
                              }
                            >
                              <div class="flex items-center gap-1">
                                <select
                                  class="border rounded text-xs px-1 py-0.5 bg-background"
                                  value={selectedCategoryId()}
                                  onChange={e => setSelectedCategoryId(e.currentTarget.value)}
                                >
                                  <option value="">Uncategorized</option>
                                  <For each={categories()}>
                                    {(cat: FinanceCategory) => (
                                      <option value={cat.id}>{cat.name}</option>
                                    )}
                                  </For>
                                </select>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  class="h-6 px-2 text-xs"
                                  onClick={() => updateCategoryMutation.mutate({
                                    transactionId: txn.id,
                                    categoryId: selectedCategoryId() || null,
                                  })}
                                  disabled={updateCategoryMutation.isPending}
                                >
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  class="h-6 px-2 text-xs"
                                  onClick={() => setRecategorizeId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </Show>
                          </td>
                          <td class="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            <Show when={txn.installmentNumber && txn.totalInstallments}>
                              <span class="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                                {txn.installmentNumber}/{txn.totalInstallments}
                              </span>
                            </Show>
                          </td>
                          <td class="px-4 py-3" />
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <Show when={totalPages() > 1}>
                <div class="flex items-center justify-between px-4 py-3 border-t">
                  <p class="text-sm text-muted-foreground">
                    Page {pageIndex() + 1} of {totalPages()}
                  </p>
                  <div class="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pageIndex() === 0}
                      onClick={() => setPageIndex(p => p - 1)}
                    >
                      <div class="i-tabler-chevron-left size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pageIndex() + 1 >= totalPages()}
                      onClick={() => setPageIndex(p => p + 1)}
                    >
                      <div class="i-tabler-chevron-right size-4" />
                    </Button>
                  </div>
                </div>
              </Show>
            </Show>
          </CardContent>
        </Card>
      </Suspense>
    </div>
  );
};
