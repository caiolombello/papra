import type { Component } from 'solid-js';
import type { FinanceInvestment } from '../finance.types';
import { useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { For, Show, Suspense } from 'solid-js';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/ui/components/card';
import { fetchFinanceInvestments } from '../finance.services';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatPercent(value: number | null) {
  if (value == null) return '—';
  return `${(value * 100).toFixed(2)}%`;
}

function formatDate(date: Date | string | null) {
  if (!date) return null;
  return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const FinanceInvestmentsPage: Component = () => {
  const params = useParams();

  const investmentsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'finance', 'investments'],
    queryFn: () => fetchFinanceInvestments({ organizationId: params.organizationId }),
  }));

  const investments = () => investmentsQuery.data?.investments ?? [];

  const totalBalance = () => investments().reduce((acc: number, inv: FinanceInvestment) => acc + inv.balance, 0);
  const totalProfit = () => investments().reduce((acc: number, inv: FinanceInvestment) => acc + (inv.amountProfit ?? 0), 0);
  const avgMonthlyRate = () => {
    const rates = investments().map((inv: FinanceInvestment) => inv.lastMonthRate).filter((r): r is number => r != null);
    if (rates.length === 0) return null;
    return rates.reduce((a, b) => a + b, 0) / rates.length;
  };

  return (
    <div class="p-6 mt-4 pb-32 max-w-5xl mx-auto">
      <Suspense>
        <h2 class="text-lg font-semibold mb-6">Investments</h2>

        {/* Summary */}
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
          <Card>
            <CardHeader class="pb-2">
              <div class="flex items-center gap-2">
                <div class="i-tabler-wallet size-5 text-blue-600" />
                <CardTitle class="text-sm text-muted-foreground font-normal">Total Balance</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p class="text-2xl font-bold text-blue-600">{formatCurrency(totalBalance())}</p>
              <p class="text-xs text-muted-foreground mt-1">
                {investments().length} position{investments().length !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader class="pb-2">
              <div class="flex items-center gap-2">
                <div class="i-tabler-trending-up size-5 text-green-600" />
                <CardTitle class="text-sm text-muted-foreground font-normal">Total Profit</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p
                class="text-2xl font-bold"
                classList={{ 'text-green-600': totalProfit() >= 0, 'text-red-600': totalProfit() < 0 }}
              >
                {totalProfit() >= 0 ? '+' : ''}{formatCurrency(totalProfit())}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader class="pb-2">
              <div class="flex items-center gap-2">
                <div class="i-tabler-percentage size-5 text-violet-600" />
                <CardTitle class="text-sm text-muted-foreground font-normal">Avg Monthly Rate</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p class="text-2xl font-bold text-violet-600">{formatPercent(avgMonthlyRate())}</p>
              <p class="text-xs text-muted-foreground mt-1">last month average</p>
            </CardContent>
          </Card>
        </div>

        {/* Investment Cards Grid */}
        <Show
          when={investments().length > 0}
          fallback={
            <div class="text-center py-16 text-muted-foreground">
              <div class="i-tabler-chart-line size-12 mx-auto mb-4 opacity-40" />
              <p>No investments found</p>
            </div>
          }
        >
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <For each={investments()}>
              {(inv: FinanceInvestment) => (
                <Card>
                  <CardHeader class="pb-2">
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0">
                        <CardTitle class="text-sm font-semibold truncate">{inv.name}</CardTitle>
                        <Show when={inv.type || inv.subtype}>
                          <p class="text-xs text-muted-foreground mt-0.5">
                            {[inv.type, inv.subtype].filter(Boolean).join(' · ')}
                          </p>
                        </Show>
                      </div>
                      <Show when={inv.code}>
                        <span class="text-xs px-1.5 py-0.5 rounded bg-muted font-mono shrink-0">{inv.code}</span>
                      </Show>
                    </div>
                  </CardHeader>
                  <CardContent class="space-y-3">
                    <div>
                      <p class="text-xl font-bold">{formatCurrency(inv.balance)}</p>
                      <Show when={inv.amountProfit != null}>
                        <p
                          class="text-xs mt-0.5"
                          classList={{
                            'text-green-600': (inv.amountProfit ?? 0) >= 0,
                            'text-red-600': (inv.amountProfit ?? 0) < 0,
                          }}
                        >
                          {(inv.amountProfit ?? 0) >= 0 ? '+' : ''}{formatCurrency(inv.amountProfit!)} profit
                        </p>
                      </Show>
                    </div>

                    <div class="grid grid-cols-2 gap-2 text-xs">
                      <div class="space-y-0.5">
                        <p class="text-muted-foreground">Monthly rate</p>
                        <p class="font-medium">{formatPercent(inv.lastMonthRate)}</p>
                      </div>
                      <div class="space-y-0.5">
                        <p class="text-muted-foreground">Annual rate</p>
                        <p class="font-medium">{formatPercent(inv.annualRate ?? inv.lastTwelveMonthsRate)}</p>
                      </div>
                    </div>

                    <Show when={inv.dueDate}>
                      <div class="flex items-center gap-1 text-xs text-muted-foreground pt-1 border-t">
                        <div class="i-tabler-calendar size-3.5" />
                        <span>Due: {formatDate(inv.dueDate)}</span>
                      </div>
                    </Show>
                  </CardContent>
                </Card>
              )}
            </For>
          </div>
        </Show>
      </Suspense>
    </div>
  );
};
