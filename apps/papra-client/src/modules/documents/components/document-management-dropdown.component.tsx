import type { DropdownMenuSubTriggerProps } from '@kobalte/core/dropdown-menu';
import type { Component } from 'solid-js';
import type { Document } from '../documents.types';
import { A } from '@solidjs/router';
import { createSignal, For, Show } from 'solid-js';
import { useQuery } from '@tanstack/solid-query';
import { fetchFolders } from '@/modules/document-folders/document-folders.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { Button } from '@/modules/ui/components/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/modules/ui/components/dropdown-menu';
import { getDocumentOpenWithApps } from '../document.models';
import { useDeleteDocument } from '../documents.composables';
import { moveDocumentToFolder } from '../documents.services';
import { DocumentOpenWithDropdownItems } from './open-with.component';
import { useRenameDocumentDialog } from './rename-document-button.component';

export const DocumentManagementDropdown: Component<{ document: Document }> = (props) => {
  const { deleteDocument } = useDeleteDocument();
  const { openRenameDialog } = useRenameDocumentDialog();
  const { t } = useI18n();

  const deleteDoc = () => deleteDocument({
    documentId: props.document.id,
    organizationId: props.document.organizationId,
    documentName: props.document.name,
  });

  const getOpenWithApps = () => getDocumentOpenWithApps({ document: props.document });

  return (

    <DropdownMenu>
      <DropdownMenuTrigger
        as={(props: DropdownMenuSubTriggerProps) => (
          <Button variant="ghost" size="icon" {...props}>
            <div class="i-tabler-dots-vertical size-4" />
          </Button>
        )}
      />
      <DropdownMenuContent class="w-48">
        <DropdownMenuItem
          class="cursor-pointer "
          as={A}
          href={`/organizations/${props.document.organizationId}/documents/${props.document.id}`}
        >
          <div class="i-tabler-info-circle size-4 mr-2" />
          <span>Document details</span>
        </DropdownMenuItem>

        <Show when={getOpenWithApps().length > 0}>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger class="cursor-pointer">
              <div class="i-tabler-app-window size-4 mr-2" />
              <span>{t('documents.open-with.label')}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DocumentOpenWithDropdownItems apps={getOpenWithApps()} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </Show>

        <DropdownMenuItem
          class="cursor-pointer"
          onClick={() => openRenameDialog({
            documentId: props.document.id,
            organizationId: props.document.organizationId,
            documentName: props.document.name,
          })}
        >
          <div class="i-tabler-pencil size-4 mr-2" />
          <span>Rename document</span>
        </DropdownMenuItem>

        <MoveToFolderSubmenu document={props.document} />

        <DropdownMenuItem
          class="cursor-pointer text-red"
          onClick={() => deleteDoc()}
        >
          <div class="i-tabler-trash size-4 mr-2" />
          <span>Delete document</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

  );
};

const MoveToFolderSubmenu: Component<{ document: Document }> = (props) => {
  const foldersQuery = useQuery(() => ({
    queryKey: ['organizations', props.document.organizationId, 'folders', 'root'],
    queryFn: () => fetchFolders({ organizationId: props.document.organizationId }),
  }));

  const handleMove = async (folderId: string | null) => {
    await moveDocumentToFolder({
      documentId: props.document.id,
      organizationId: props.document.organizationId,
      folderId,
    });
    await queryClient.invalidateQueries({ queryKey: ['organizations', props.document.organizationId, 'documents'] });
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger class="cursor-pointer">
        <div class="i-tabler-folder-symlink size-4 mr-2" />
        <span>Move to folder</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent class="w-48">
        <DropdownMenuItem class="cursor-pointer" onClick={() => handleMove(null)}>
          <div class="i-tabler-home size-4 mr-2" />
          <span>Root (no folder)</span>
        </DropdownMenuItem>
        <For each={foldersQuery.data?.folders ?? []}>
          {folder => (
            <DropdownMenuItem
              class="cursor-pointer"
              onClick={() => handleMove(folder.id)}
              disabled={props.document.folderId === folder.id}
            >
              <div class="i-tabler-folder size-4 mr-2" />
              <span class="truncate">{folder.name}</span>
            </DropdownMenuItem>
          )}
        </For>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};
