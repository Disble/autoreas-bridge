import { useCallback } from 'react';
import type { SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { compactMetadataPatch } from './intake-panel.helpers';
import type { useIntakeEditorState } from './use-intake-editor-state';
import type { useIntakeRows } from './use-intake-rows';
import type { useIntakeStoreSlice } from './use-intake-store-slice';

/** Everything the intake metadata-revert callbacks read from their caller. */
interface IntakeMetadataRevertInput {
  /** The row derivations holding the editable id set. */
  readonly rows: ReturnType<typeof useIntakeRows>;
  /** The editor state holding this session's per-row metadata records. */
  readonly editor: ReturnType<typeof useIntakeEditorState>;
  /** The Season store slice holding the metadata persist action. */
  readonly store: ReturnType<typeof useIntakeStoreSlice>;
  /** The season port every row mutation goes through. */
  readonly source: SeasonSource;
}

/**
 * useIntakeMetadataRevert owns the two ways a row's metadata goes away: Clear
 * removes the stored record and the local state the user sees (the whole point
 * of the clear action — a lookup confirmed on the wrong anime must be undoable
 * without an editor), and Undo replays one row's last applied patch
 * pre-image. A no-op for a row with nothing applied.
 * @param input The rows, editor state, store slice, and source.
 * @returns The metadata-clear and metadata-undo handlers.
 */
export function useIntakeMetadataRevert(input: Readonly<IntakeMetadataRevertInput>) {
  const { rows, editor, store, source } = input;
  const { editableIds } = rows;
  const { appliedMetadataByRow, setMetadataByRow, setAppliedMetadataByRow } = editor;
  const { setSeasonAnimeMetadata } = store;

  // 6. Callbacks
  const onMetadataClear = useCallback(
    (rowId: string) => {
      if (!editableIds.has(rowId)) {
        return;
      }
      setMetadataByRow((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== rowId)));
      // The session's applied record needs no removal: the view only summarises rows
      // that still hold values, so a cleared row stops showing one either way.
      void setSeasonAnimeMetadata(source, rowId, '');
    },
    [editableIds, setSeasonAnimeMetadata, source],
  );
  const onMetadataUndo = useCallback(
    (rowId: string) => {
      const applied = appliedMetadataByRow[rowId];
      if (applied === undefined) {
        return;
      }
      // The pre-image restores what applied touched; a field that had no value
      // before must leave the row holding nothing, not holding an empty string.
      setMetadataByRow((current) => ({
        ...current,
        [rowId]: compactMetadataPatch({ ...current[rowId], ...applied.previous }),
      }));
      setAppliedMetadataByRow((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => id !== rowId)),
      );
    },
    [appliedMetadataByRow],
  );

  return { onMetadataClear, onMetadataUndo };
}
