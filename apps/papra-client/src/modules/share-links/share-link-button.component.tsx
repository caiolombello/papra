import type { Component } from 'solid-js';
import { createMutation } from '@tanstack/solid-query';
import { createSignal, Show } from 'solid-js';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/modules/ui/components/dialog';
import { TextField, TextFieldLabel, TextFieldRoot } from '@/modules/ui/components/textfield';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';
import { createToast } from '@/modules/ui/components/sonner';
import { createShareLink } from './share-links.services';

const EXPIRY_OPTIONS = [
  { value: '1', label: '1 hour' },
  { value: '24', label: '24 hours' },
  { value: '168', label: '7 days' },
  { value: '720', label: '30 days' },
];

export const ShareLinkButton: Component<{
  organizationId: string;
  resourceType: 'document' | 'meeting';
  resourceId: string;
  variant?: 'outline' | 'ghost' | 'default';
  size?: 'sm' | 'default' | 'icon';
}> = (props) => {
  const [open, setOpen] = createSignal(false);
  const [password, setPassword] = createSignal('');
  const [expiresInHours, setExpiresInHours] = createSignal('24');
  const [maxViews, setMaxViews] = createSignal('');
  const [generatedUrl, setGeneratedUrl] = createSignal('');

  const mutation = createMutation(() => ({
    mutationFn: () => createShareLink({
      organizationId: props.organizationId,
      resourceType: props.resourceType,
      resourceId: props.resourceId,
      password: password() || undefined,
      expiresInHours: Number(expiresInHours()),
      maxViews: maxViews() ? Number(maxViews()) : undefined,
    }),
    onSuccess: (data) => {
      setGeneratedUrl(data.shareUrl);
      createToast({ type: 'success', message: 'Share link created' });
    },
    onError: () => {
      createToast({ type: 'error', message: 'Failed to create share link' });
    },
  }));

  const copyUrl = () => {
    navigator.clipboard.writeText(generatedUrl());
    createToast({ type: 'success', message: 'Link copied to clipboard' });
  };

  const reset = () => {
    setPassword('');
    setExpiresInHours('24');
    setMaxViews('');
    setGeneratedUrl('');
  };

  return (
    <Dialog open={open()} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger as={Button} variant={props.variant ?? 'outline'} size={props.size ?? 'sm'}>
        <div class="i-tabler-share size-4 mr-2" />
        Share
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Share Link</DialogTitle>
        </DialogHeader>

        <Show when={!generatedUrl()} fallback={
          <div class="flex flex-col gap-4 mt-2">
            <div class="bg-muted rounded-lg p-4">
              <p class="text-xs text-muted-foreground mb-2">Share this link:</p>
              <div class="flex items-center gap-2">
                <code class="text-sm break-all flex-1">{generatedUrl()}</code>
                <Button size="sm" variant="outline" onClick={copyUrl}>
                  <div class="i-tabler-copy size-4" />
                </Button>
              </div>
            </div>
            <Show when={password()}>
              <p class="text-xs text-muted-foreground">
                Password: <code class="bg-muted px-1 rounded">{password()}</code>
              </p>
            </Show>
            <DialogFooter>
              <Button onClick={() => { setOpen(false); reset(); }}>Done</Button>
            </DialogFooter>
          </div>
        }>
          <div class="flex flex-col gap-4 mt-2">
            <div>
              <label class="text-sm font-medium mb-1 block">Expires in</label>
              <Select
                value={expiresInHours()}
                onChange={v => v && setExpiresInHours(v)}
                options={EXPIRY_OPTIONS.map(o => o.value)}
                itemComponent={props => (
                  <SelectItem item={props.item}>
                    {EXPIRY_OPTIONS.find(o => o.value === props.item.rawValue)?.label}
                  </SelectItem>
                )}
              >
                <SelectTrigger>
                  <SelectValue<string>>
                    {state => EXPIRY_OPTIONS.find(o => o.value === state.selectedOption())?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </div>

            <TextFieldRoot>
              <TextFieldLabel>Password (optional)</TextFieldLabel>
              <TextField
                type="password"
                placeholder="Leave empty for no password"
                value={password()}
                onInput={e => setPassword((e.target as HTMLInputElement).value)}
              />
            </TextFieldRoot>

            <TextFieldRoot>
              <TextFieldLabel>Max views (optional)</TextFieldLabel>
              <TextField
                type="number"
                min="1"
                placeholder="Unlimited"
                value={maxViews()}
                onInput={e => setMaxViews((e.target as HTMLInputElement).value)}
              />
            </TextFieldRoot>

            <DialogFooter>
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                {mutation.isPending ? 'Creating...' : 'Create Link'}
              </Button>
            </DialogFooter>
          </div>
        </Show>
      </DialogContent>
    </Dialog>
  );
};
