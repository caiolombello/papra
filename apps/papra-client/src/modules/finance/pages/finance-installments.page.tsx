import type { Component } from 'solid-js';
import type { FinanceTransaction } from '../finance.types';
import { useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createSignal, For, Show, Suspense } from 'solid-js';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/ui/components/card';
import { Button } from '@/modules/ui/components/button';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
import { fetchFinanceInstallments } from '../finance.services';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(date: Date | string | null) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

function getEndDate(txn: FinanceTransaction): Date | null {
  const base = txn.purchaseDate ?? txn.date;
  if (!base || !txn.totalInstallments) return null;
  const d = new Date(base);
  d.setMonth(d.getMonth() + txn.totalInstallments);
  return d;
}

function monthsUntil(date: Date | null): number {
  if (!date) return Infinity;
  const now = new Date();
  return (date.getFullYear() - now.getFullYear()) * 12 + (date.getMonth() - now.getMonth());
}

function getRemainingInstallments(txn: FinanceTransaction): number {
  if (!txn.installmentNumber || !txn.totalInstallments) return 0;
  return txn.totalInstallments - txn.installmentNumber;
}

export const FinanceInstallmentsPage: Component = () => {
  const params = useParams();

  const [simAmount, setSimAmount] = createSignal('');
  const [simInstallments, setSimInstallments] = createSignal('');

  const installmentsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'finance', 'installments'],
    queryFn: () => fetchFinanceInstallments({ organizationId: params.organizationId }),
  }));

  const installments = () => installmentsQuery.data?.installments ?? [];

  const endingSoon = () =>
    installments().filter((txn: FinanceTransaction) => {
      const end = getEndDate(txn);
      const months = monthsUntil(end);
      return months >= 0 && months <= 2;
    });

  const active = () =>
    installments().filter((txn: FinanceTransaction) => {
      const end = getEndDate(txn);
      const months = monthsUntil(end);
      return months > 2;
    });

  const freedUpMonthly = () => {
    return endingSoon().reduce((acc: number, txn: FinanceTransaction) => acc + txn.amount, 0);
  };

  const simMonthly = () => {
    const amount = parseFloat(simAmount().replace(',', '.'));
    const installments = parseInt(simInstallments(), 10);
    if (!amount || !installments || installments <= 0) return null;
    return amount / installments;
  };

  return (
    <div class="p-6 mt-4 pb-32 max-w-4xl mx-auto">
      <Suspense>
        <h2 class="text-lg font-semibold mb-6">Installments</h2>

        {/* Ending Soon Banner */}
        <Show when={endingSoon().length > 0}>
          <Card class="mb-6 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
            <CardHeader class="pb-2">
              <div class="flex items-center gap-2">
                <div class="i-tabler-circle-check size-5 text-green-600" />
                <CardTitle class="text-sm text-green-700 dark:text-green-300">Freed-up capacity soon</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p class="text-2xl font-bold text-green-600 mb-3">
                +{formatCurrency(freedUpMonthly())} / month
              </p>
              <div class="space-y-2">
                <For each={endingSoon()}>
                  {(txn: FinanceTransaction) => {
                    const end = getEndDate(txn);
                    const months = monthsUntil(end);
                    return (
                      <div class="flex items-center justify-between text-sm">
                        <span class="font-medium truncate">{txn.merchantName ?? txn.description}</span>
                        <span class="text-muted-foreground shrink-0 ml-2">
                          {formatCurrency(txn.amount)}/mo · ends in {months === 0 ? 'this month' : `${months} month${months !== 1 ? 's' : ''}`}
                        </span>
                      </div>
                    );
                  }}
                </For>
              </div>
            </CardContent>
          </Card>
        </Show>

        {/* Active Installments */}
        <Card class="mb-6">
          <CardHeader>
            <CardTitle class="text-base">Active Installments</CardTitle>
          </CardHeader>
          <CardContent class="p-0">
            <Show
              when={installments().length > 0}
              fallback={
                <div class="text-center py-10 text-muted-foreground text-sm">
                  No active installments
                </div>
              }
            >
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead class="border-b">
                    <tr class="text-left text-muted-foreground">
                      <th class="px-4 py-3 font-medium">Description</th>
                      <th class="px-4 py-3 font-medium text-center">Progress</th>
                      <th class="px-4 py-3 font-medium text-right">Monthly</th>
                      <th class="px-4 py-3 font-medium text-right">Est. End</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={installments()}>
                      {(txn: FinanceTransaction) => {
                        const end = getEndDate(txn);
                        const months = monthsUntil(end);
                        const isSoon = months >= 0 && months <= 2;
                        const remaining = getRemainingInstallments(txn);

                        return (
                          <tr
                            class="border-b last:border-0 transition-colors"
                            classList={{
                              'bg-amber-50/50 dark:bg-amber-900/10': isSoon,
                              'hover:bg-muted/40': !isSoon,
                            }}
                          >
                            <td class="px-4 py-3">
                              <div class="flex items-center gap-2">
                                <Show when={isSoon}>
                                  <div class="i-tabler-clock size-3.5 text-amber-500 shrink-0" />
                                </Show>
                                <div>
                                  <p class="font-medium truncate max-w-xs">{txn.merchantName ?? txn.description}</p>
                                  <Show when={remaining > 0}>
                                    <p class="text-xs text-muted-foreground">{remaining} installment{remaining !== 1 ? 's' : ''} remaining</p>
                                  </Show>
                                </div>
                              </div>
                            </td>
                            <td class="px-4 py-3 text-center">
                              <Show when={txn.installmentNumber && txn.totalInstallments}>
                                <span class="px-2 py-0.5 rounded bg-muted text-xs font-medium">
                                  {txn.installmentNumber}/{txn.totalInstallments}
                                </span>
                              </Show>
                            </td>
                            <td class="px-4 py-3 text-right font-semibold text-red-600">
                              {formatCurrency(txn.amount)}
                            </td>
                            <td class="px-4 py-3 text-right text-muted-foreground">
                              {end ? formatDate(end) : '—'}
                            </td>
                          </tr>
                        );
                      }}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </CardContent>
        </Card>

        {/* Installment Simulator */}
        <Card>
          <CardHeader>
            <div class="flex items-center gap-2">
              <div class="i-tabler-calculator size-5 text-muted-foreground" />
              <CardTitle class="text-base">Installment Simulator</CardTitle>
            </div>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div class="space-y-1">
                <label class="text-sm font-medium">Total amount (BRL)</label>
                <TextFieldRoot>
                  <TextField
                    type="number"
                    placeholder="1200.00"
                    value={simAmount()}
                    onInput={e => setSimAmount(e.currentTarget.value)}
                    min="0"
                    step="0.01"
                  />
                </TextFieldRoot>
              </div>
              <div class="space-y-1">
                <label class="text-sm font-medium">Number of installments</label>
                <TextFieldRoot>
                  <TextField
                    type="number"
                    placeholder="12"
                    value={simInstallments()}
                    onInput={e => setSimInstallments(e.currentTarget.value)}
                    min="1"
                    step="1"
                  />
                </TextFieldRoot>
              </div>
            </div>

            <Show when={simMonthly() != null}>
              <div class="rounded-lg bg-muted p-4 flex items-center justify-between">
                <span class="text-sm font-medium">Monthly impact</span>
                <span class="text-xl font-bold text-red-600">
                  {formatCurrency(simMonthly()!)} / month
                </span>
              </div>
            </Show>

            <Show when={simAmount() && simInstallments() && simMonthly() == null}>
              <p class="text-sm text-destructive">Enter valid values to calculate</p>
            </Show>
          </CardContent>
        </Card>
      </Suspense>
    </div>
  );
};
