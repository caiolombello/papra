import type { Component } from 'solid-js';
import type { Document } from '../documents.types';
import { useQuery } from '@tanstack/solid-query';
import { createEffect, createSignal, Match, onCleanup, onMount, Switch } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';
import { getDocumentIcon } from '../document.models';
import { fetchDocumentFile } from '../documents.services';

const THUMBNAIL_SIZE = 40;

const PdfPageThumbnail: Component<{ blob: Blob }> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;

  createEffect(async () => {
    if (!canvasRef) {
      return;
    }

    try {
      const pdfjsLib = await import('pdfjs-dist');
      const url = URL.createObjectURL(props.blob);

      try {
        const pdf = await pdfjsLib.getDocument(url).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const scale = THUMBNAIL_SIZE / Math.max(viewport.width, viewport.height);
        const scaledViewport = page.getViewport({ scale });

        canvasRef.width = scaledViewport.width;
        canvasRef.height = scaledViewport.height;

        const ctx = canvasRef.getContext('2d');

        if (ctx) {
          await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
        }
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      // Silently fail — fallback icon will show
    }
  });

  return <canvas ref={canvasRef} class="max-w-full max-h-full" />;
};

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

  const isImage = () => props.document.mimeType.startsWith('image/');
  const isPdf = () => props.document.mimeType === 'application/pdf';
  const hasThumbnail = () => isImage() || isPdf();

  const fileQuery = useQuery(() => ({
    queryKey: ['organizations', props.document.organizationId, 'documents', props.document.id, 'file'],
    queryFn: () => fetchDocumentFile({ documentId: props.document.id, organizationId: props.document.organizationId }),
    enabled: isVisible() && hasThumbnail(),
    staleTime: 5 * 60 * 1000,
  }));

  return (
    <div
      ref={containerRef}
      class="size-10 rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0"
    >
      <Switch fallback={<FallbackIcon document={props.document} />}>
        <Match when={isImage() && fileQuery.data}>
          <img
            src={URL.createObjectURL(fileQuery.data!)}
            class="size-10 object-cover"
            alt=""
          />
        </Match>
        <Match when={isPdf() && fileQuery.data}>
          <PdfPageThumbnail blob={fileQuery.data!} />
        </Match>
      </Switch>
    </div>
  );
};
