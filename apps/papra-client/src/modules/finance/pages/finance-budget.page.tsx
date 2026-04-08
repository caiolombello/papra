import type { Component } from 'solid-js';
import type { FinanceBudget, FinanceCategory } from '../finance.types';
import { useParams } from '@solidjs/router';
import { useMutation, useQuery } from '@tanstack/solid-query';
import { createSignal, For, Show, Suspense } from 'solid-js';
import { queryClient } from '@/modules/shared/query/query-client';
import { Button } from '@/modules/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/ui/components/card';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
import {
  deleteFinanceBudget,
  fetchFinanceBudgets,
  fetchFinanceCategories,
  upsertFinanceBudget,
} from '../finance.services';
import { useFinancialMonth } from '../composables/use-financial-month';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

const BudgetProgressBar: Component<{
  budget: FinanceBudget;
  categoryName: string;
  spending: number;
  onDelete: () => void;
}> = (props) => {
  const percentage = () => Math.min((props.spending / props.budget.amount) * 100, 100);
  const isOver = () => props.spending > props.budget.amount;

  return (
    <div class="space-y-2 p-4 rounded-lg border">
      <div class="flex items-center justify-between gap-2">
        <span class="font-medium truncate">{props.categoryName}</span>
        <Button
          variant="ghost"
          size="icon"
          class="size-6 text-muted-foreground hover:text-red-500 shrink-0"
          onClick={props.onDelete}
        >
          <div class="i-tabler-trash size-3.5" />
        </Button>
      </div>

      <div class="h-2.5 rounded-full bg-muted overflow-hidden">
        <div
          class="h-full rounded-full transition-all"
          classList={{
            'bg-red-500': isOver(),
            'bg-amber-500': !isOver() && percentage() >= 80,
            'bg-primary': !isOver() && percentage() < 80,
          }}
          style={{ width: `${percentage()}%` }}
        />
      </div>

      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">
          {formatCurrency(props.spending)} spent
        </span>
        <span
          classList={{
            'font-semibold text-red-600': isOver(),
            'text-muted-foreground': !isOver(),
          }}
        >
          {isOver() ? `${formatCurrency(props.spending - props.budget.amount)} over` : `${formatCurrency(props.budget.amount - props.spending)} left`}
          {' '}/ {formatCurrency(props.budget.amount)}
        </span>
      </div>
    </div>
  );
};

export const FinanceBudgetPage: Component = () => {
  const params = useParams();
  const { financialMonth, formatFinancialMonth, navigateMonth } = useFinancialMonth();

  const [newCategoryId, setNewCategoryId] = createSignal<string>('');
  const [newAmount, setNewAmount] = createSignal('');

  const budgetsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'finance', 'budgets', financialMonth()],
    queryFn: () => fetchFinanceBudgets({ organizationId: params.organizationId, financialMonth: financialMonth() }),
  }));

  const categoriesQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'finance', 'categories'],
    queryFn: () => fetchFinanceCategories({ organizationId: params.organizationId }),
  }));

  const upsertMutation = useMutation(() => ({
    mutationFn: (vars: { categoryId: string | null; amount: number }) =>
      upsertFinanceBudget({
        organizationId: params.organizationId,
        categoryId: vars.categoryId,
        amount: vars.amount,
        financialMonth: financialMonth(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finance', 'budgets'] });
      createToast({ type: 'success', message: 'Budget saved' });
      setNewCategoryId('');
      setNewAmount('');
    },
    onError: () => {
      createToast({ type: 'error', message: 'Failed to save budget' });
    },
  }));

  const deleteMutation = useMutation(() => ({
    mutationFn: (budgetId: string) =>
      deleteFinanceBudget({ organizationId: params.organizationId, budgetId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finance', 'budgets'] });
      createToast({ type: 'success', message: 'Budget deleted' });
    },
    onError: () => {
      createToast({ type: 'error', message: 'Failed to delete budget' });
    },
  }));

  const budgets = () => budgetsQuery.data?.budgets ?? [];
  const categories = () => categoriesQuery.data?.categories ?? [];

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return 'Geral';
    return categories().find((c: FinanceCategory) => c.id === categoryId)?.name ?? categoryId;
  };

  const handleAdd = () => {
    const amount = parseFloat(newAmount().replace(',', '.'));
    if (!amount || amount <= 0) {
      createToast({ type: 'error', message: 'Enter a valid amount' });
      return;
    }
    upsertMutation.mutate({
      categoryId: newCategoryId() || null,
      amount,
    });
  };

  return (
    <div class="p-6 mt-4 pb-32 max-w-3xl mx-auto">
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

        {/* Budget List */}
        <h2 class="text-lg font-semibold mb-4">Budget Overview</h2>

        <Show
          when={budgets().length > 0}
          fallback={
            <div class="text-center py-10 text-muted-foreground text-sm">
              No budgets for this period. Add one below.
            </div>
          }
        >
          <div class="space-y-3 mb-8">
            <For each={budgets()}>
              {(budget: FinanceBudget) => (
                <BudgetProgressBar
                  budget={budget}
                  categoryName={getCategoryName(budget.categoryId)}
                  spending={0}
                  onDelete={() => deleteMutation.mutate(budget.id)}
                />
              )}
            </For>
          </div>
        </Show>

        {/* Add Budget Form */}
        <Card>
          <CardHeader>
            <CardTitle class="text-base">Add / Update Budget</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div class="space-y-1">
                <label class="text-sm font-medium">Category</label>
                <select
                  class="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={newCategoryId()}
                  onChange={e => setNewCategoryId(e.currentTarget.value)}
                >
                  <option value="">Geral (overall)</option>
                  <For each={categories()}>
                    {(cat: FinanceCategory) => (
                      <option value={cat.id}>{cat.name}</option>
                    )}
                  </For>
                </select>
              </div>

              <div class="space-y-1">
                <label class="text-sm font-medium">Amount (BRL)</label>
                <TextFieldRoot>
                  <TextField
                    type="number"
                    placeholder="500.00"
                    value={newAmount()}
                    onInput={e => setNewAmount(e.currentTarget.value)}
                    min="0"
                    step="0.01"
                  />
                </TextFieldRoot>
              </div>
            </div>

            <Button
              onClick={handleAdd}
              disabled={upsertMutation.isPending}
              class="w-full sm:w-auto"
            >
              <div classList={{ 'i-tabler-loader-2 animate-spin size-4 mr-2': upsertMutation.isPending, 'i-tabler-plus size-4 mr-2': !upsertMutation.isPending }} />
              Save Budget
            </Button>
          </CardContent>
        </Card>
      </Suspense>
    </div>
  );
};
