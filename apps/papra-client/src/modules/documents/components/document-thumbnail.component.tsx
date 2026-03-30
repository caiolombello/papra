import type { Component } from 'solid-js';
import type { Document } from '../documents.types';
import { createSignal, Match, onCleanup, onMount, Switch } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';
import { getDocumentIcon } from '../document.models';

const FallbackIcon: Component<{ document: Document }> = (props) => {
  return (
    <div class="bg-muted flex items-center justify-center p-2 rounded-lg">
      <div class={cn(getDocumentIcon({ document: props.document }), 'size-6 text-primary')} />
    </div>
  );
};

export const DocumentThumbnail: Component<{ document: Document }> = (props) => {
  const [isVisible, setIsVisible] = createSignal(false);
  const [hasError, setHasError] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;

  onMount(() => {
    if (!containerRef) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' },
    );

    observer.observe(containerRef);
    onCleanup(() => observer.disconnect());
  });

  const isImage = () => props.document.mimeType.startsWith('image/');
  const thumbnailUrl = () =>
    `/api/organizations/${props.document.organizationId}/documents/${props.document.id}/thumbnail`;

  return (
    <div
      ref={containerRef}
      class="size-10 rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0"
    >
      <Switch fallback={<FallbackIcon document={props.document} />}>
        <Match when={isImage() && isVisible() && !hasError()}>
          <img
            src={thumbnailUrl()}
            class="size-10 object-cover"
            alt=""
            loading="lazy"
            onError={() => setHasError(true)}
          />
        </Match>
      </Switch>
    </div>
  );
};
