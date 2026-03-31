import type { Component } from 'solid-js';
import { useParams } from '@solidjs/router';
import { createSignal, For, Match, Show, Switch } from 'solid-js';
import { Button } from '@/modules/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/ui/components/card';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';

type SharedDocument = {
  name: string;
  mimeType: string;
  originalSize: number;
  content: string;
  createdAt: number;
};

type SharedMeeting = {
  title: string;
  summary: string | null;
  language: string | null;
  context: string | null;
  createdAt: number;
  chunks: { speaker: string | null; startedAtMs: number | null; endedAtMs: number | null; content: string }[];
};

type SharedResource =
  | { type: 'document'; document: SharedDocument }
  | { type: 'meeting'; meeting: SharedMeeting }
  | { requiresPassword: true };

async function fetchSharedResource(token: string, password?: string): Promise<SharedResource> {
  const response = await fetch(`/api/share/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(password ? { body: JSON.stringify({ password }) } : {}),
  });

  if (response.status === 401) {
    const data = await response.json();
    if (data.requiresPassword) {
      return { requiresPassword: true };
    }
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.message || `Error ${response.status}`);
  }

  return response.json();
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatMs(ms: number | null) {
  if (ms === null) return '';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export const SharedResourcePage: Component = () => {
  const params = useParams();
  const [state, setState] = createSignal<'loading' | 'password' | 'loaded' | 'error'>('loading');
  const [resource, setResource] = createSignal<SharedResource | null>(null);
  const [error, setError] = createSignal('');
  const [password, setPassword] = createSignal('');

  const load = async (pwd?: string) => {
    setState('loading');
    try {
      const data = await fetchSharedResource(params.token, pwd);
      if ('requiresPassword' in data && data.requiresPassword) {
        setState('password');
        return;
      }
      setResource(data);
      setState('loaded');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load shared resource');
      setState('error');
    }
  };

  // Initial load
  load();

  const handlePasswordSubmit = (e: Event) => {
    e.preventDefault();
    load(password());
  };

  return (
    <div class="min-h-screen bg-background">
      <div class="max-w-4xl mx-auto p-6 pt-12">
        <div class="flex items-center gap-2 mb-8 text-muted-foreground">
          <div class="i-tabler-share size-5" />
          <span class="text-sm">Shared via Papra</span>
        </div>

        <Switch>
          <Match when={state() === 'loading'}>
            <div class="flex items-center justify-center py-20">
              <div class="i-tabler-loader-2 animate-spin size-8 text-muted-foreground" />
            </div>
          </Match>

          <Match when={state() === 'password'}>
            <Card class="max-w-md mx-auto">
              <CardHeader>
                <CardTitle class="flex items-center gap-2">
                  <div class="i-tabler-lock size-5" />
                  Password Required
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePasswordSubmit} class="flex flex-col gap-4">
                  <TextFieldRoot>
                    <TextField
                      type="password"
                      placeholder="Enter password"
                      value={password()}
                      onInput={e => setPassword((e.target as HTMLInputElement).value)}
                      autofocus
                    />
                  </TextFieldRoot>
                  <Button type="submit" disabled={!password()}>
                    Unlock
                  </Button>
                </form>
              </CardContent>
            </Card>
          </Match>

          <Match when={state() === 'error'}>
            <Card class="max-w-md mx-auto">
              <CardContent class="py-12 text-center">
                <div class="i-tabler-link-off size-12 mx-auto mb-4 text-muted-foreground" />
                <h2 class="text-lg font-semibold mb-2">Unable to access</h2>
                <p class="text-muted-foreground">{error()}</p>
              </CardContent>
            </Card>
          </Match>

          <Match when={state() === 'loaded' && resource()}>
            <Switch>
              <Match when={resource() && 'type' in resource()! && (resource() as any).type === 'document'}>
                {(() => {
                  const doc = () => (resource() as { type: 'document'; document: SharedDocument }).document;
                  return (
                    <>
                      <Card>
                        <CardHeader>
                          <div class="flex items-center gap-3">
                            <div class="i-tabler-file-text size-8 text-primary" />
                            <div>
                              <CardTitle>{doc().name}</CardTitle>
                              <div class="text-sm text-muted-foreground mt-1">
                                {formatFileSize(doc().originalSize)} &middot; {formatDate(doc().createdAt)}
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <Show when={doc().content}>
                          <CardContent>
                            <pre class="whitespace-pre-wrap text-sm leading-7 font-sans">{doc().content}</pre>
                          </CardContent>
                        </Show>
                      </Card>
                    </>
                  );
                })()}
              </Match>

              <Match when={resource() && 'type' in resource()! && (resource() as any).type === 'meeting'}>
                {(() => {
                  const meeting = () => (resource() as { type: 'meeting'; meeting: SharedMeeting }).meeting;
                  return (
                    <>
                      <Card>
                        <CardHeader>
                          <div class="flex items-center gap-3">
                            <div class="i-tabler-microphone size-8 text-primary" />
                            <div>
                              <CardTitle>{meeting().title}</CardTitle>
                              <div class="text-sm text-muted-foreground mt-1">
                                {formatDate(meeting().createdAt)}
                                <Show when={meeting().language}>
                                  {' '}&middot; {meeting().language}
                                </Show>
                                <Show when={meeting().context}>
                                  {' '}&middot; {meeting().context}
                                </Show>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <Show when={meeting().summary}>
                          <CardContent>
                            <h3 class="text-sm font-medium mb-2 text-muted-foreground">Summary</h3>
                            <p class="text-sm leading-6">{meeting().summary}</p>
                          </CardContent>
                        </Show>
                      </Card>

                      <h3 class="text-lg font-semibold mt-6 mb-3">Transcript</h3>
                      <div class="space-y-1">
                        <For each={meeting().chunks}>
                          {chunk => (
                            <div class="flex gap-3 py-2 px-3 rounded hover:bg-muted/50">
                              <Show when={chunk.startedAtMs !== null}>
                                <span class="text-xs text-muted-foreground font-mono w-12 flex-shrink-0 pt-0.5">
                                  {formatMs(chunk.startedAtMs)}
                                </span>
                              </Show>
                              <div class="flex-1">
                                <Show when={chunk.speaker}>
                                  <span class="text-xs font-medium text-primary mr-2">{chunk.speaker}</span>
                                </Show>
                                <span class="text-sm leading-6">{chunk.content}</span>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </>
                  );
                })()}
              </Match>
            </Switch>
          </Match>
        </Switch>
      </div>
    </div>
  );
};
