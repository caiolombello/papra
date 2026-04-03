import type { Component } from 'solid-js';
import { useParams } from '@solidjs/router';
import { createSignal, For, Match, Show, Switch } from 'solid-js';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/modules/ui/components/card';
import { createToast } from '@/modules/ui/components/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/modules/ui/components/tabs';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';

type SharedDocument = {
  name: string;
  mimeType: string;
  originalSize: number;
  content: string;
  createdAt: number;
};

type MeetingChunk = { speaker: string | null; startedAtMs: number | null; endedAtMs: number | null; content: string };

type SharedMeeting = {
  title: string;
  summary: string | null;
  language: string | null;
  context: string | null;
  createdAt: number;
  chunks: MeetingChunk[];
  translations?: { id: string; targetLanguage: string; status: string; chunks?: { speaker: string | null; content: string }[] }[];
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

function groupChunksIntoParagraphs(chunks: { content: string; startedAtMs?: number | null; endedAtMs?: number | null }[]): string[] {
  if (chunks.length === 0) return [];

  const PAUSE_THRESHOLD_MS = 2000;
  const MAX_CHUNKS_PER_PARAGRAPH = 6;

  const paragraphs: string[] = [];
  let current: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    current.push(chunks[i].content);

    const isLast = i === chunks.length - 1;
    const hasTimestamps = chunks[i].endedAtMs != null && chunks[i + 1]?.startedAtMs != null;
    const pauseDetected = hasTimestamps && (chunks[i + 1].startedAtMs! - chunks[i].endedAtMs!) > PAUSE_THRESHOLD_MS;
    const chunkLimitReached = !hasTimestamps && current.length >= MAX_CHUNKS_PER_PARAGRAPH;

    if (isLast || pauseDetected || chunkLimitReached) {
      paragraphs.push(current.join(' '));
      current = [];
    }
  }

  return paragraphs;
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
      <div class="max-w-4xl mx-auto px-4 sm:px-6 pt-6 sm:pt-12 pb-8">
        <div class="flex items-center gap-2 mb-6 sm:mb-8 text-muted-foreground">
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
                  const fileUrl = () => {
                    const base = `/api/share/${params.token}/file`;
                    return password() ? `${base}?password=${encodeURIComponent(password())}` : base;
                  };
                  const isPdf = () => doc().mimeType === 'application/pdf';
                  const isImage = () => doc().mimeType.startsWith('image/');
                  const [showText, setShowText] = createSignal(false);

                  return (
                    <>
                      <Card>
                        <CardHeader>
                          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div class="flex items-center gap-3 min-w-0">
                              <div class="i-tabler-file-text size-6 sm:size-8 text-primary flex-shrink-0" />
                              <div class="min-w-0">
                                <CardTitle class="text-base sm:text-lg truncate">{doc().name}</CardTitle>
                                <div class="text-xs sm:text-sm text-muted-foreground mt-1">
                                  {formatFileSize(doc().originalSize)} &middot; {formatDate(doc().createdAt)}
                                </div>
                              </div>
                            </div>
                            <div class="flex gap-2 self-end sm:self-auto">
                              <Show when={doc().content}>
                                <Button variant="outline" size="sm" onClick={() => setShowText(!showText())}>
                                  <div class={`size-4 sm:mr-2 ${showText() ? 'i-tabler-file' : 'i-tabler-file-text'}`} />
                                  <span class="hidden sm:inline">{showText() ? 'Preview' : 'Text'}</span>
                                </Button>
                              </Show>
                              <Button variant="outline" size="sm" as="a" href={fileUrl()} download={doc().name}>
                                <div class="i-tabler-download size-4 sm:mr-2" />
                                <span class="hidden sm:inline">Download</span>
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <Show when={showText()}>
                            <pre class="whitespace-pre-wrap text-sm leading-7 font-sans">{doc().content}</pre>
                          </Show>
                          <Show when={!showText()}>
                            <Show when={isPdf()}>
                              <iframe
                                src={fileUrl()}
                                class="w-full rounded border"
                                style={{ height: 'min(80vh, 600px)' }}
                                title={doc().name}
                              />
                            </Show>
                            <Show when={isImage()}>
                              <img
                                src={fileUrl()}
                                alt={doc().name}
                                class="max-w-full rounded border"
                              />
                            </Show>
                            <Show when={!isPdf() && !isImage()}>
                              <Show when={doc().content} fallback={
                                <div class="text-center py-12 text-muted-foreground">
                                  <div class="i-tabler-file size-12 mx-auto mb-4 opacity-40" />
                                  <p>No preview available for this file type.</p>
                                  <Button variant="outline" class="mt-4" as="a" href={fileUrl()} download={doc().name}>
                                    <div class="i-tabler-download size-4 mr-2" />
                                    Download file
                                  </Button>
                                </div>
                              }>
                                <pre class="whitespace-pre-wrap text-sm leading-7 font-sans">{doc().content}</pre>
                              </Show>
                            </Show>
                          </Show>
                        </CardContent>
                      </Card>
                    </>
                  );
                })()}
              </Match>

              <Match when={resource() && 'type' in resource()! && (resource() as any).type === 'meeting'}>
                {(() => {
                  const meeting = () => (resource() as { type: 'meeting'; meeting: SharedMeeting }).meeting;
                  const [activeTab, setActiveTab] = createSignal('original');

                  const completedTranslations = () => (meeting().translations ?? []).filter(t => t.status === 'completed' && t.chunks?.length);

                  const getActiveChunks = (): { speaker: string | null; content: string }[] => {
                    const tab = activeTab();
                    if (tab === 'original') return meeting().chunks;
                    const translation = completedTranslations().find(t => t.targetLanguage === tab);
                    return translation?.chunks ?? [];
                  };

                  const copyTranscript = () => {
                    const chunks = getActiveChunks();
                    const hasSpeakers = chunks.some(c => c.speaker && c.speaker !== 'unknown');
                    const text = hasSpeakers
                      ? chunks.map(c => `[${c.speaker ?? 'Unknown'}]: ${c.content}`).join('\n\n')
                      : groupChunksIntoParagraphs(chunks).join('\n\n');
                    navigator.clipboard.writeText(text).then(() => {
                      createToast({ type: 'success', message: 'Transcript copied to clipboard' });
                    }).catch(() => {
                      createToast({ type: 'error', message: 'Failed to copy' });
                    });
                  };

                  const renderChunks = (chunks: { speaker: string | null; content: string; startedAtMs?: number | null; endedAtMs?: number | null }[]) => {
                    const hasSpeakers = chunks.some(c => c.speaker && c.speaker !== 'unknown');
                    return hasSpeakers
                      ? (
                          <div class="space-y-3">
                            <For each={chunks}>
                              {chunk => (
                                <Card>
                                  <CardHeader class="pb-3">
                                    <div class="flex flex-wrap items-center justify-between gap-2">
                                      <Badge variant="outline">{chunk.speaker}</Badge>
                                      <Show when={chunk.startedAtMs != null}>
                                        <div class="text-xs text-muted-foreground">
                                          {formatMs(chunk.startedAtMs ?? null)}
                                        </div>
                                      </Show>
                                    </div>
                                  </CardHeader>
                                  <CardContent>
                                    <div class="whitespace-pre-wrap text-sm leading-6">{chunk.content}</div>
                                  </CardContent>
                                </Card>
                              )}
                            </For>
                          </div>
                        )
                      : (
                          <Card>
                            <CardContent class="pt-6">
                              <div class="whitespace-pre-wrap text-sm leading-7">
                                {groupChunksIntoParagraphs(chunks).join('\n\n')}
                              </div>
                            </CardContent>
                          </Card>
                        );
                  };

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
                            <p class="text-sm leading-6 whitespace-pre-wrap">{meeting().summary}</p>
                          </CardContent>
                        </Show>
                      </Card>

                      <div class="flex items-center justify-between mt-4 sm:mt-6 mb-3">
                        <h3 class="text-base sm:text-lg font-semibold">Transcript</h3>
                        <Show when={meeting().chunks.length > 0}>
                          <Button variant="outline" size="sm" onClick={copyTranscript}>
                            <div class="i-tabler-copy size-4 mr-1.5" />
                            Copy transcript
                          </Button>
                        </Show>
                      </div>

                      <Show
                        when={meeting().chunks.length > 0}
                        fallback={<div class="text-sm text-muted-foreground">No transcript available.</div>}
                      >
                        <Show
                          when={completedTranslations().length > 0}
                          fallback={renderChunks(meeting().chunks)}
                        >
                          <Tabs value={activeTab()} onChange={setActiveTab}>
                            <TabsList>
                              <TabsTrigger value="original">
                                Original ({meeting().language ?? '?'})
                              </TabsTrigger>
                              <For each={completedTranslations()}>
                                {translation => (
                                  <TabsTrigger value={translation.targetLanguage}>
                                    {translation.targetLanguage}
                                  </TabsTrigger>
                                )}
                              </For>
                            </TabsList>

                            <TabsContent value="original" class="mt-4">
                              {renderChunks(meeting().chunks)}
                            </TabsContent>

                            <For each={completedTranslations()}>
                              {translation => (
                                <TabsContent value={translation.targetLanguage} class="mt-4">
                                  {renderChunks(translation.chunks ?? [])}
                                </TabsContent>
                              )}
                            </For>
                          </Tabs>
                        </Show>
                      </Show>
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
