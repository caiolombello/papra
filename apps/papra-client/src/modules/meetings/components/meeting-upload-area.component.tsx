import type { Component } from 'solid-js';
import { useParams } from '@solidjs/router';
import { safely } from '@corentinth/chisels';
import { createSignal, For, Show } from 'solid-js';
import { promptUploadFiles } from '@/modules/shared/files/upload';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { createToast } from '@/modules/ui/components/sonner';
import { requestNotificationPermission } from '../composables/use-transcription-notifications';
import { updateMeetingStatus, uploadMeetingFile } from '../meetings.services';

const ACCEPTED_MEETING_TYPES = '.mp3,.mp4,.m4a,.wav,.webm,.ogg,.oga,.flac,.aac,.mov,.mkv,.mpeg,.mpga';

type UploadTask = {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export const MeetingUploadArea: Component = () => {
  const params = useParams();
  const [isDragging, setIsDragging] = createSignal(false);
  const [getTasks, setTasks] = createSignal<UploadTask[]>([]);

  const isUploading = () => getTasks().some(t => t.status === 'uploading' || t.status === 'pending');

  const updateTask = (file: File, update: Partial<UploadTask>) => {
    setTasks(tasks => tasks.map(t => t.file === file ? { ...t, ...update } : t));
  };

  const upload = async (files: File[]) => {
    const valid = files.filter(f => f.type.startsWith('audio/') || f.type.startsWith('video/'));
    if (valid.length === 0) {
      return;
    }

    requestNotificationPermission();
    setTasks(tasks => [...tasks, ...valid.map(file => ({ file, status: 'pending' as const, progress: 0 }))]);

    for (const file of valid) {
      updateTask(file, { status: 'uploading' });

      const [result, error] = await safely(uploadMeetingFile({
        file,
        organizationId: params.organizationId,
        onProgress: (progress) => updateTask(file, { progress }),
      }));

      if (error) {
        updateTask(file, { status: 'error', error: error.message });
        createToast({ type: 'error', message: `Failed to upload ${file.name}` });
      } else {
        updateTask(file, { status: 'success', progress: 1 });
        createToast({ type: 'success', message: `${file.name} uploaded — transcription will start automatically` });

        await safely(updateMeetingStatus({
          organizationId: params.organizationId,
          meetingId: result.meetingId,
          status: 'processing',
        }));
      }
    }

    await queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'meetings'] });
  };

  const clearCompleted = () => {
    setTasks(tasks => tasks.filter(t => t.status !== 'success' && t.status !== 'error'));
  };

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    if (!event.dataTransfer?.files) {
      return;
    }
    await upload([...event.dataTransfer.files]);
  };

  const handleSelectFiles = async () => {
    const { files } = await promptUploadFiles({ acceptedTypes: ACCEPTED_MEETING_TYPES });
    await upload(files);
  };

  return (
    <div class="space-y-2">
      <div
        class={cn(
          'border border-[2px] border-dashed text-muted-foreground rounded-lg p-4 flex items-center justify-center gap-4',
          { 'border-primary': isDragging() },
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div class="i-tabler-cloud-upload size-8" />
        <p class="text-sm">
          {isDragging() ? 'Drop audio/video files here' : 'Drag and drop audio or video files to transcribe'}
        </p>
        <Button variant="outline" size="sm" onClick={handleSelectFiles} disabled={isUploading()}>
          <div class="i-tabler-upload mr-2" />
          Select files
        </Button>
      </div>

      <Show when={getTasks().length > 0}>
        <div class="border rounded-lg divide-y">
          <For each={getTasks()}>
            {task => (
              <div class="px-4 py-2 flex items-center gap-3 text-sm">
                <div class="flex-1 min-w-0">
                  <div class="truncate">{task.file.name}</div>
                  <div class="text-xs text-muted-foreground">{formatFileSize(task.file.size)}</div>
                </div>

                <Show when={task.status === 'uploading'}>
                  <div class="flex items-center gap-2 flex-none">
                    <div class="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        class="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${Math.round(task.progress * 100)}%` }}
                      />
                    </div>
                    <span class="text-xs text-muted-foreground w-8">{Math.round(task.progress * 100)}%</span>
                  </div>
                </Show>

                <Show when={task.status === 'pending'}>
                  <div class="i-tabler-loader-2 animate-spin text-muted-foreground size-5 flex-none" />
                </Show>

                <Show when={task.status === 'success'}>
                  <div class="i-tabler-circle-check text-primary size-5 flex-none" />
                </Show>

                <Show when={task.status === 'error'}>
                  <div class="i-tabler-circle-x text-red-500 size-5 flex-none" title={task.error} />
                </Show>
              </div>
            )}
          </For>

          <Show when={!isUploading() && getTasks().length > 0}>
            <div class="px-4 py-2 flex justify-end">
              <Button variant="ghost" size="sm" onClick={clearCompleted}>
                Clear
              </Button>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};
