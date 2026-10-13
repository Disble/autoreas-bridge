import { useCallback } from 'react';
import type { SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { INTAKE_FOLDER_PICKER_TITLE } from './intake-panel.constants';
import { buildSeasonCreateMetadata, collectFolderOverrides } from './intake-panel.helpers';
import type { useIntakeEditorState } from './use-intake-editor-state';
import type { useIntakeMetadataView } from './use-intake-metadata-view';
import type { useIntakeStoreSlice } from './use-intake-store-slice';

/** Everything the intake creation callbacks read from their caller. */
interface IntakeCreationCallbacksInput {
  /** The editor state holding the selection and folder overrides. */
  readonly editor: ReturnType<typeof useIntakeEditorState>;
  /** The metadata view holding what each row displays. */
  readonly metadata: ReturnType<typeof useIntakeMetadataView>;
  /** The Season store slice holding the creation action. */
  readonly store: ReturnType<typeof useIntakeStoreSlice>;
  /** The season port every row mutation goes through. */
  readonly source: SeasonSource;
}

/**
 * useIntakeCreationCallbacks owns the creation path: the per-row folder
 * override picker and the explicit Create action over the picked rows. Only
 * the picked rows travel, and each one carries only the metadata it holds —
 * whether from this session's lookup or from storage — because that is exactly
 * what the row displays above the Create button.
 * @param input The editor state, metadata view, store slice, and source.
 * @returns The folder picker and the Create action.
 */
export function useIntakeCreationCallbacks(input: Readonly<IntakeCreationCallbacksInput>) {
  const { editor, metadata, store, source } = input;
  const { selected, setSelected, folderOverrides, setFolderOverrides } = editor;
  const { heldByRow } = metadata;
  const { createSeasonAnimes } = store;

  // 6. Callbacks
  const onPickFolder = useCallback(
    (rowId: string) => {
      void source.pickFolder(INTAKE_FOLDER_PICKER_TITLE).then((picked) => {
        if (picked !== '') {
          setFolderOverrides((prev) => ({ ...prev, [rowId]: picked }));
        }
      });
    },
    [source],
  );
  const onCreate = useCallback(() => {
    if (selected.size === 0) {
      return;
    }
    const ids = [...selected];

    setSelected(new Set());
    void createSeasonAnimes(
      source,
      ids,
      collectFolderOverrides(ids, folderOverrides),
      buildSeasonCreateMetadata(heldByRow, ids),
    );
  }, [selected, folderOverrides, heldByRow, createSeasonAnimes, source]);

  return { onPickFolder, onCreate };
}
