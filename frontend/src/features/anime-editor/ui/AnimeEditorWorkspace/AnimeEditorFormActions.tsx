import archiveDownIcon from '@iconify-icons/solar/archive-down-linear';
import archiveUpIcon from '@iconify-icons/solar/archive-up-linear';
import rewindBackIcon from '@iconify-icons/solar/rewind-back-linear';
import { Button } from '@heroui/react';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import { ANIME_EDITOR_DEACTIVATE_LABEL, ANIME_EDITOR_REPEAT_LABEL, ANIME_EDITOR_RESTORE_LABEL } from './anime-editor-workspace.constants';
import type { AnimeEditorFormPanelProps } from './anime-editor-workspace.types';

/**
 * Renders the anime data card's sticky footer: the lifecycle actions, Discard changes and Save.
 * Repeat, Restore and Deactivate are icon-only with the Anime Detail toolbar's glyphs (Deactivate's
 * archive-down mirrors Restore's archive-up and tints danger on hover); their dialogs carry the text.
 */
export function AnimeEditorFormActions({ viewModel }: Readonly<AnimeEditorFormPanelProps>) {
  const record = viewModel.selectedRecord;
  return (
    <footer className="border-t border-divider bg-content1 px-5 py-3 shadow-[0_-8px_20px_-12px_rgba(0,0,0,0.6)]"><div className="flex flex-wrap items-center gap-3">
      {/*
        Repeat renders OUTSIDE the active/inactive ternary below (design D9):
        its gate (`status > 0`) is independent of active/inactive, so a
        finished active anime is repeatable alongside Deactivate. Folding it
        into the ternary would silently hide Repeat for every active anime.
        Gated on the saved `record`, never `viewModel.draft` (design D10) --
        the Status field is editable, and gating on the draft would make the
        button flicker as the user moves the dropdown before saving.
      */}
      {record !== undefined && record.frequent.status > 0 && (
        <IconActionButton ariaLabel={ANIME_EDITOR_REPEAT_LABEL} icon={rewindBackIcon} isDisabled={viewModel.isSaving} tooltip={ANIME_EDITOR_REPEAT_LABEL} variant="tertiary" onPress={() => viewModel.onRequestLifecycleAction('repeat')} />
      )}
      {record?.frequent.active === false ? (
        <IconActionButton ariaLabel={ANIME_EDITOR_RESTORE_LABEL} icon={archiveUpIcon} isDisabled={viewModel.isSaving} tooltip={ANIME_EDITOR_RESTORE_LABEL} variant="tertiary" onPress={() => viewModel.onRequestLifecycleAction('restore')} />
      ) : (
        <IconActionButton ariaLabel={ANIME_EDITOR_DEACTIVATE_LABEL} icon={archiveDownIcon} isDisabled={record === undefined || viewModel.isSaving} tone="danger" tooltip={ANIME_EDITOR_DEACTIVATE_LABEL} onPress={() => viewModel.onRequestLifecycleAction('deactivate')} />
      )}
      <Button className="ml-auto" isDisabled={!viewModel.isRecordDirty || viewModel.isSaving} variant="tertiary" onPress={viewModel.onDiscardChanges}>Discard changes</Button>
      <Button isDisabled={!viewModel.canSave || viewModel.isSaving} isPending={viewModel.isSaving} variant="primary" onPress={() => void viewModel.onSave()}>Save</Button>
    </div></footer>
  );
}
