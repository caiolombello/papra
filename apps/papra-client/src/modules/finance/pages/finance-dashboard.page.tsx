import type { Component } from 'solid-js';
import type { FinanceBudget, FinanceDashboard } from '../finance.types';
import { useParams } from '@solidjs/router';
import { useMutation, useQuery } from '@tanstack/solid-query';
import { For, Show, Suspense } from 'solid-js';
import { queryClient } from '@/modules/shared/query/query-client';
import { Button } from '@/modules/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/ui/components/card';
import { createToast } from '@/modules/ui/components/sonner';
import { fetchFinanceDashboard, triggerFinanceSync } from '../finance.services';
import { useFinancialMonth } from '../composables/use-financial-month';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

const BudgetProgressBar: Component<{ budget: FinanceBudget; spending: number; categoryName: string }> = (props) => {
  const percentage = () => Math.min((props.spending / props.budget.amount) * 100, 100);
  const isOver = () => props.spending > props.budget.amount;

  return (
    <div class="space-y-1">
      <div class="flex items-center justify-between text-sm">
        <span class="font-medium truncate">{props.categoryName}</span>
        <span class="text-muted-foreground ml-2 shrink-0">
          {formatCurrency(props.spending)} / {formatCurrency(props.budget.amount)}
        </span>
      </div>
      <div class="h-2 rounded-full bg-muted overflow-hidden">
        <div
          class="h-full rounded-full transition-all"
          classList={{
            'bg-red-500': isOver(),
            'bg-primary': !isOver(),
          }}
          style={{ width: `${percentage()}%` }}
        />
      </div>
    </div>
  );
};

export const FinanceDashboardPage: Component = () => {
  const params = useParams();
  const { financialMonth, formatFinancialMonth, navigateMonth } = useFinancialMonth();

  const dashboardQuery = useQuery<FinanceDashboard>(() => ({
    queryKey: ['organizations', params.organizationId, 'finance', 'dashboard', financialMonth()],
    queryFn: () => fetchFinanceDashboard({
      organizationId: params.organizationId,
      financialMonth: financialMonth(),
    }),
  }));

  const syncMutation = useMutation(() => ({
    mutationFn: () => triggerFinanceSync({ organizationId: params.organizationId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finance'] });
      createToast({ type: 'success', message: 'Sync triggered successfully' });
    },
    onError: () => {
      createToast({ type: 'error', message: 'Failed to trigger sync' });
    },
  }));

  const data = () => dashboardQuery.data;

  const spendingByCategoryId = () => {
    const map: Record<string, number> = {};
    for (const s of data()?.spending ?? []) {
      map[s.categoryId ?? 'uncategorized'] = s.total;
    }
    return map;
  };

  return (
    <div class="p-6 mt-4 pb-32 max-w-5xl mx-auto">
      <Suspense>
        {/* Header */}
        <div class="flex items-center justify-between mb-6 gap-4">
          <div class="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateMonth(-1)}
              aria-label="Previous month"
            >
              <div class="i-tabler-chevron-left size-4" />
            </Button>
            <span class="text-sm font-medium min-w-48 text-center">
              {formatFinancialMonth(financialMonth())}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateMonth(1)}
              aria-label="Next month"
            >
              <div class="i-tabler-chevron-right size-4" />
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            <div classList={{
              'i-tabler-refresh size-4 mr-2': true,
              'animate-spin': syncMutation.isPending,
            }} />
            Sync
          </Button>
        </div>

        {/* Summary Cards */}
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
          {/* Bank Balance */}
          <Card>
            <CardHeader class="pb-2">
              <div class="flex items-center gap-2">
                <div class="i-tabler-building-bank size-5 text-green-600" />
                <CardTitle class="text-sm text-muted-foreground font-normal">Bank Balance</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p class="text-2xl font-bold text-green-600">
                {formatCurrency(data()?.totalBankBalance ?? 0)}
              </p>
              <p class="text-xs text-muted-foreground mt-1">
                {data()?.accounts.filter(a => a.type === 'BANK').length ?? 0} accounts
              </p>
            </CardContent>
          </Card>

          {/* Open Bills */}
          <Card>
            <CardHeader class="pb-2">
              <div class="flex items-center gap-2">
                <div class="i-tabler-credit-card size-5 text-red-600" />
                <CardTitle class="text-sm text-muted-foreground font-normal">Open Bills</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p class="text-2xl font-bold text-red-600">
                {formatCurrency(data()?.totalOpenBills ?? 0)}
              </p>
              <p class="text-xs text-muted-foreground mt-1">
                {data()?.openBills.length ?? 0} credit card{(data()?.openBills.length ?? 0) !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>

          {/* Investments */}
          <Card>
            <CardHeader class="pb-2">
              <div class="flex items-center gap-2">
                <div class="i-tabler-trending-up size-5 text-blue-600" />
                <CardTitle class="text-sm text-muted-foreground font-normal">Investments</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p class="text-2xl font-bold text-blue-600">
                {formatCurrency(data()?.investmentsSummary.totalBalance ?? 0)}
              </p>
              <p class="text-xs text-muted-foreground mt-1">
                <Show when={(data()?.investmentsSummary.totalProfit ?? 0) >= 0} fallback={
                  <span class="text-red-500">
                    {formatCurrency(data()?.investmentsSummary.totalProfit ?? 0)} profit
                  </span>
                }>
                  <span class="text-green-600">
                    +{formatCurrency(data()?.investmentsSummary.totalProfit ?? 0)} profit
                  </span>
                </Show>
                {' '}· {data()?.investmentsSummary.count ?? 0} positions
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Budget & Installments Row */}
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-6">
          {/* Budget Progress */}
          <Card>
            <CardHeader>
              <div class="flex items-center gap-2">
                <div class="i-tabler-chart-pie size-5 text-muted-foreground" />
                <CardTitle class="text-base">Budget</CardTitle>
              </div>
            </CardHeader>
            <CardContent class="space-y-4">
              <Show
                when={(data()?.budgets.length ?? 0) > 0}
                fallback={
                  <p class="text-sm text-muted-foreground text-center py-4">No budgets configured</p>
                }
              >
                <For each={data()?.budgets ?? []}>
                  {(budget) => {
                    const spent = () => spendingByCategoryId()[budget.categoryId ?? 'uncategorized'] ?? 0;
                    return (
                      <BudgetProgressBar
                        budget={budget}
                        spending={spent()}
                        categoryName={budget.categoryId ?? 'Uncategorized'}
                      />
                    );
                  }}
                </For>
              </Show>
            </CardContent>
          </Card>

          {/* Active Installments */}
          <Card>
            <CardHeader>
              <div class="flex items-center gap-2">
                <div class="i-tabler-calendar-repeat size-5 text-muted-foreground" />
                <CardTitle class="text-base">Active Installments</CardTitle>
              </div>
            </CardHeader>
            <CardContent class="space-y-3">
              <Show
                when={(data()?.activeInstallments.length ?? 0) > 0}
                fallback={
                  <p class="text-sm text-muted-foreground text-center py-4">No active installments</p>
                }
              >
                <For each={data()?.activeInstallments ?? []}>
                  {(txn) => (
                    <div class="flex items-center justify-between gap-2 text-sm">
                      <div class="min-w-0">
                        <p class="font-medium truncate">{txn.merchantName ?? txn.description}</p>
                        <p class="text-muted-foreground text-xs">
                          {txn.installmentNumber}/{txn.totalInstallments} installments
                        </p>
                      </div>
                      <div class="text-right shrink-0">
                        <p class="font-medium">{formatCurrency(txn.amount)}</p>
                        <Show when={txn.totalAmount}>
                          <p class="text-muted-foreground text-xs">
                            {formatCurrency(txn.totalAmount!)} total
                          </p>
                        </Show>
                      </div>
                    </div>
                  )}
                </For>
              </Show>
            </CardContent>
          </Card>
        </div>

        {/* Credit Card Timeline */}
        <Show when={(data()?.creditCards.length ?? 0) > 0}>
          <Card>
            <CardHeader>
              <div class="flex items-center gap-2">
                <div class="i-tabler-calendar-due size-5 text-muted-foreground" />
                <CardTitle class="text-base">Credit Card Closing Dates</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <For each={data()?.creditCards ?? []}>
                  {(card) => {
                    const bill = () => data()?.openBills.find(b => b.accountId === card.id);
                    return (
                      <div class="rounded-lg border p-3 space-y-1">
                        <p class="font-medium text-sm truncate">{card.name}</p>
                        <div class="flex items-center justify-between text-xs text-muted-foreground">
                          <Show when={card.closingDay}>
                            <span>Closes day {card.closingDay}</span>
                          </Show>
                          <Show when={card.dueDay}>
                            <span>Due day {card.dueDay}</span>
                          </Show>
                        </div>
                        <Show when={bill()}>
                          <p class="text-sm font-semibold text-red-600">
                            {formatCurrency(bill()!.totalAmount)}
                          </p>
                          <p class="text-xs text-muted-foreground">
                            Due {formatDate(bill()!.dueDate)} · {bill()!.status}
                          </p>
                        </Show>
                        <Show when={!bill()}>
                          <p class="text-xs text-muted-foreground">No open bill</p>
                        </Show>
                        <Show when={card.availableCreditLimit != null}>
                          <p class="text-xs text-muted-foreground">
                            {formatCurrency(card.availableCreditLimit!)} available
                          </p>
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </div>
            </CardContent>
          </Card>
        </Show>
      </Suspense>
    </div>
  );
};
