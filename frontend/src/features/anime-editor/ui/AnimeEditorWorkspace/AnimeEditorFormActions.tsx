import { Button } from '@heroui/react';
import { ANIME_EDITOR_REPEAT_LABEL, ANIME_EDITOR_RESTORE_LABEL } from './anime-editor-workspace.constants';
import type { AnimeEditorFormPanelProps } from './anime-editor-workspace.types';

/** Renders the anime data card's sticky footer: the lifecycle actions, Discard changes and Save. */
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
        <Button isDisabled={viewModel.isSaving} variant="tertiary" onPress={() => viewModel.onRequestLifecycleAction('repeat')}>{ANIME_EDITOR_REPEAT_LABEL}</Button>
      )}
      {record?.frequent.active === false ? (
        <Button className="text-success hover:text-success" isDisabled={viewModel.isSaving} variant="tertiary" onPress={() => viewModel.onRequestLifecycleAction('restore')}>{ANIME_EDITOR_RESTORE_LABEL}</Button>
      ) : (
        <Button className="text-danger hover:text-danger" isDisabled={record === undefined || viewModel.isSaving} variant="tertiary" onPress={() => viewModel.onRequestLifecycleAction('deactivate')}>Deactivate anime</Button>
      )}
      <Button className="ml-auto" isDisabled={!viewModel.isRecordDirty || viewModel.isSaving} variant="tertiary" onPress={viewModel.onDiscardChanges}>Discard changes</Button>
      <Button isDisabled={!viewModel.canSave || viewModel.isSaving} isPending={viewModel.isSaving} variant="primary" onPress={() => void viewModel.onSave()}>Save</Button>
    </div></footer>
  );
}
