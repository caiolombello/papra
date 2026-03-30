import type { Component } from 'solid-js';
import type { PdfPasswordRule } from '../pdf-password-rules.services';
import { useParams } from '@solidjs/router';
import { createMutation, createQuery } from '@tanstack/solid-query';
import { createSignal, For, Match, Show, Switch } from 'solid-js';
import { useConfirmModal } from '@/modules/shared/confirm';
import { queryClient } from '@/modules/shared/query/query-client';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/ui/components/dialog';
import { EmptyState } from '@/modules/ui/components/empty';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldLabel, TextFieldRoot } from '@/modules/ui/components/textfield';
import {
  createPdfPasswordRule,
  deletePdfPasswordRule,
  fetchPdfPasswordRules,
  updatePdfPasswordRule,
} from '../pdf-password-rules.services';

type RuleForm = {
  name: string;
  subjectPattern: string;
  password: string;
  priority: number;
};

const QUERY_KEY = (orgId: string) => ['organizations', orgId, 'pdf-password-rules'];

const AddRuleDialog: Component<{ organizationId: string; onSuccess: () => void }> = (props) => {
  const [open, setOpen] = createSignal(false);
  const [form, setForm] = createSignal<RuleForm>({ name: '', subjectPattern: '', password: '', priority: 0 });

  const mutation = createMutation(() => ({
    mutationFn: async () => {
      const f = form();
      await createPdfPasswordRule({
        organizationId: props.organizationId,
        rule: {
          name: f.name,
          subjectPattern: f.subjectPattern,
          password: f.password,
          priority: f.priority,
          enabled: true,
        },
      });
    },
    onSuccess: () => {
      props.onSuccess();
      setOpen(false);
      setForm({ name: '', subjectPattern: '', password: '', priority: 0 });
      createToast({ message: 'Password rule created', type: 'success' });
    },
    onError: () => {
      createToast({ message: 'Failed to create rule', type: 'error' });
    },
  }));

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <Dialog open={open()} onOpenChange={setOpen}>
      <DialogTrigger as={Button} class="flex items-center gap-2">
        <div class="i-tabler-plus size-4" />
        Add Rule
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New PDF Password Rule</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} class="flex flex-col gap-4 mt-2">
          <TextFieldRoot>
            <TextFieldLabel>Name</TextFieldLabel>
            <TextField
              id="ppr-name"
              placeholder="e.g. Comgas"
              value={form().name}
              onInput={e => setForm(f => ({ ...f, name: (e.target as HTMLInputElement).value }))}
              required
            />
          </TextFieldRoot>

          <TextFieldRoot>
            <TextFieldLabel>Subject Pattern</TextFieldLabel>
            <TextField
              id="ppr-subject-pattern"
              placeholder="e.g. *comgas* or *CPFL*"
              value={form().subjectPattern}
              onInput={e => setForm(f => ({ ...f, subjectPattern: (e.target as HTMLInputElement).value }))}
              required
            />
            <p class="text-xs text-muted-foreground mt-1">
              Use <code class="bg-muted px-1 rounded">*</code> as wildcard. Case-insensitive. Example: <code class="bg-muted px-1 rounded">*comgas*</code>
            </p>
          </TextFieldRoot>

          <TextFieldRoot>
            <TextFieldLabel>Password</TextFieldLabel>
            <TextField
              id="ppr-password"
              type="password"
              placeholder="PDF password"
              value={form().password}
              onInput={e => setForm(f => ({ ...f, password: (e.target as HTMLInputElement).value }))}
              required
            />
          </TextFieldRoot>

          <TextFieldRoot>
            <TextFieldLabel>Priority</TextFieldLabel>
            <TextField
              id="ppr-priority"
              type="number"
              min="0"
              value={String(form().priority)}
              onInput={e => setForm(f => ({ ...f, priority: Number((e.target as HTMLInputElement).value) }))}
            />
            <p class="text-xs text-muted-foreground mt-1">Higher priority rules are tried first.</p>
          </TextFieldRoot>

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creating…' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const PdfPasswordRuleCard: Component<{ rule: PdfPasswordRule; organizationId: string }> = (props) => {
  const { confirm } = useConfirmModal();

  const toggleMutation = createMutation(() => ({
    mutationFn: async () => {
      await updatePdfPasswordRule({
        organizationId: props.organizationId,
        ruleId: props.rule.id,
        updates: { enabled: props.rule.enabled === 0 },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY(props.organizationId) });
    },
    onError: () => {
      createToast({ message: 'Failed to update rule', type: 'error' });
    },
  }));

  const deleteMutation = createMutation(() => ({
    mutationFn: async () => {
      await deletePdfPasswordRule({ organizationId: props.organizationId, ruleId: props.rule.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY(props.organizationId) });
      createToast({ message: 'Rule deleted', type: 'success' });
    },
    onError: () => {
      createToast({ message: 'Failed to delete rule', type: 'error' });
    },
  }));

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Delete password rule?',
      message: `Are you sure you want to delete the rule "${props.rule.name}"? This cannot be undone.`,
      confirmButton: { text: 'Delete' },
    });

    if (confirmed) {
      deleteMutation.mutate();
    }
  };

  return (
    <div class="flex items-center gap-3 bg-card py-4 px-6 rounded-md border">
      <div class={`i-tabler-lock size-7 opacity-40 mr-1 ${props.rule.enabled ? '' : 'opacity-20'}`} />

      <div class="flex-1 min-w-0">
        <p class="font-semibold text-sm">{props.rule.name}</p>
        <p class="text-xs text-muted-foreground truncate">
          Pattern: <code class="bg-muted px-1 rounded">{props.rule.subjectPattern}</code>
          {' · '}
          Priority: {props.rule.priority}
          {' · '}
          Password: <span class="tracking-widest">{'•'.repeat(Math.min(props.rule.password.length, 6))}</span>
        </p>
      </div>

      <div class="flex items-center gap-2 flex-shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => toggleMutation.mutate()}
          disabled={toggleMutation.isPending}
          aria-label={props.rule.enabled ? 'Disable rule' : 'Enable rule'}
        >
          <Show when={props.rule.enabled === 1} fallback={
            <><div class="i-tabler-toggle-left size-4 mr-1" />Disabled</>
          }>
            <div class="i-tabler-toggle-right size-4 mr-1" />Enabled
          </Show>
        </Button>

        <Button
          variant="outline"
          size="icon"
          class="size-8"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          aria-label="Delete rule"
        >
          <div class="i-tabler-trash size-4" />
        </Button>
      </div>
    </div>
  );
};

export const PdfPasswordRulesPage: Component = () => {
  const params = useParams();
  const organizationId = () => params.organizationId;

  const query = createQuery(() => ({
    queryKey: QUERY_KEY(organizationId()),
    queryFn: () => fetchPdfPasswordRules({ organizationId: organizationId() }),
  }));

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY(organizationId()) });
  };

  return (
    <div class="p-6 max-w-screen-lg mx-auto mt-4">
      <div class="border-b mb-6 pb-4 flex items-center justify-between gap-4 sm:flex-row flex-col">
        <div>
          <h1 class="text-xl font-bold">PDF Password Rules</h1>
          <p class="text-muted-foreground mt-1">
            Automatically unlock password-protected PDFs received via intake email, matched by email subject.
          </p>
        </div>

        <Show when={query.data?.rules && query.data.rules.length > 0}>
          <AddRuleDialog organizationId={organizationId()} onSuccess={handleSuccess} />
        </Show>
      </div>

      <Switch>
        <Match when={query.data?.rules?.length === 0}>
          <div class="mt-16">
            <EmptyState
              title="No password rules"
              description="Add rules to automatically unlock PDFs received from companies like Comgas, CPFL, Enel, and others."
              class="pt-0"
              icon="i-tabler-lock"
              cta={(
                <AddRuleDialog organizationId={organizationId()} onSuccess={handleSuccess} />
              )}
            />
          </div>
        </Match>

        <Match when={query.data?.rules && query.data.rules.length > 0}>
          <div class="flex flex-col gap-2">
            <For each={query.data?.rules}>
              {rule => <PdfPasswordRuleCard rule={rule} organizationId={organizationId()} />}
            </For>
          </div>
        </Match>
      </Switch>
    </div>
  );
};
