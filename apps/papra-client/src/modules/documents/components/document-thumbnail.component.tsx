import type { Component } from 'solid-js';
import type { Document } from '../documents.types';
import { useQuery } from '@tanstack/solid-query';
import { createSignal, Match, onCleanup, onMount, Switch } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';
import { getDocumentIcon } from '../document.models';
import { fetchDocumentFile } from '../documents.services';

// Only fetch thumbnails for images under this size (512KB)
const MAX_THUMBNAIL_FILE_SIZE = 512 * 1024;

const FallbackIcon: Component<{ document: Document }> = (props) => {
  return (
    <div class="bg-muted flex items-center justify-center p-2 rounded-lg">
      <div class={cn(getDocumentIcon({ document: props.document }), 'size-6 text-primary')} />
    </div>
  );
};

export const DocumentThumbnail: Component<{ document: Document }> = (props) => {
  const [isVisible, setIsVisible] = createSignal(false);
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

  // Only fetch thumbnails for small images — skip PDFs and large files
  const isSmallImage = () =>
    props.document.mimeType.startsWith('image/')
    && props.document.originalSize <= MAX_THUMBNAIL_FILE_SIZE;

  const fileQuery = useQuery(() => ({
    queryKey: ['organizations', props.document.organizationId, 'documents', props.document.id, 'file'],
    queryFn: () => fetchDocumentFile({ documentId: props.document.id, organizationId: props.document.organizationId }),
    enabled: isVisible() && isSmallImage(),
    staleTime: 10 * 60 * 1000,
  }));

  return (
    <div
      ref={containerRef}
      class="size-10 rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0"
    >
      <Switch fallback={<FallbackIcon document={props.document} />}>
        <Match when={isSmallImage() && fileQuery.data}>
          <img
            src={URL.createObjectURL(fileQuery.data!)}
            class="size-10 object-cover"
            alt=""
          />
        </Match>
      </Switch>
    </div>
  );
};
