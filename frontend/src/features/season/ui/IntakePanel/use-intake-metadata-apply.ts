import { useCallback } from 'react';
import type { SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { buildUndoPatch } from '../../../../shared/metadata-lookup/metadata-lookup.helpers';
import type { AnimeMetadataSelection } from '../../../../shared/metadata-lookup/metadata-lookup.types';
import { compactMetadataPatch, toIntakeMetadataPatch, toSeasonCreateMetadata } from './intake-panel.helpers';
import type { IntakeMetadataPatch } from './intake-panel.types';
import type { useIntakeEditorState } from './use-intake-editor-state';
import type { useIntakeMetadataView } from './use-intake-metadata-view';
import type { useIntakeRows } from './use-intake-rows';
import type { useIntakeStoreSlice } from './use-intake-store-slice';

/** Everything the intake metadata-apply callback reads from its caller. */
interface IntakeMetadataApplyInput {
  /** The row derivations holding the editable id set. */
  readonly rows: ReturnType<typeof useIntakeRows>;
  /** The editor state holding this session's per-row metadata records. */
  readonly editor: ReturnType<typeof useIntakeEditorState>;
  /** The metadata view holding each row's stored record. */
  readonly metadata: ReturnType<typeof useIntakeMetadataView>;
  /** The Season store slice holding the metadata persist action. */
  readonly store: ReturnType<typeof useIntakeStoreSlice>;
  /** The season port every row mutation goes through. */
  readonly source: SeasonSource;
}

/**
 * useIntakeMetadataApply attaches one confirmed lookup to its own row. The
 * selection goes through {@link toIntakeMetadataPatch}'s allow-list, so this
 * can only ever write the row's metadata — never its download page, folder,
 * watched episodes, estado or first-watch date. A lookup for a row the intake
 * list no longer shows is refused rather than attached to nothing.
 *
 * Re-applying REPLACES the row's applied patch instead of stacking a second
 * one: the new patch's pre-image is read from what the row currently holds —
 * including what STORAGE holds — so a second Undo steps back to the first
 * apply's values instead of leaving the first patch behind. The merged values
 * are written to the row's own record, so the choice survives the panel.
 * @param input The rows, editor state, metadata view, store slice, and source.
 * @returns The metadata-applied handler.
 */
export function useIntakeMetadataApply(input: Readonly<IntakeMetadataApplyInput>) {
  const { rows, editor, metadata, store, source } = input;
  const { editableIds } = rows;
  const { metadataByRow, setMetadataByRow, setAppliedMetadataByRow } = editor;
  const { storedMetadataByRow } = metadata;
  const { setSeasonAnimeMetadata } = store;

  // 6. Callbacks
  const onMetadataApplied = useCallback(
    (rowId: string, selection: AnimeMetadataSelection) => {
      if (!editableIds.has(rowId)) {
        return;
      }
      const patch = toIntakeMetadataPatch(selection);
      const held = metadataByRow[rowId] ?? storedMetadataByRow[rowId] ?? {};
      const previous = buildUndoPatch(held, patch);
      const merged = compactMetadataPatch({ ...held, ...patch });

      setMetadataByRow((current) => ({ ...current, [rowId]: merged }));
      setAppliedMetadataByRow((current) => ({
        ...current,
        [rowId]: {
          patch,
          previous,
          appliedFields: Object.keys(patch) as (keyof IntakeMetadataPatch)[],
          unfilled: selection.unfilled,
        },
      }));
      // Persist exactly the fields creation will receive, so what the row shows
      // and what the anime gets cannot drift. A failure surfaces in the panel's
      // shared error state through the store.
      void setSeasonAnimeMetadata(source, rowId, JSON.stringify(toSeasonCreateMetadata(merged)));
    },
    [editableIds, metadataByRow, storedMetadataByRow, setSeasonAnimeMetadata, source],
  );

  return { onMetadataApplied };
}
