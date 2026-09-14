import { useCallback, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import { metadataLookupSource } from '../../../../infrastructure/metadata-lookup-source/metadata-lookup-source.helpers';
import { buildUndoPatch } from '../../../../shared/metadata-lookup/metadata-lookup.helpers';
import type { AnimeMetadataSelection, AppliedMetadata } from '../../../../shared/metadata-lookup/metadata-lookup.types';
import { toCreateRowPatch } from './anime-create-metadata.helpers';
import { ANIME_CREATE_MIN_ROWS } from './anime-create.constants';
import { applyRowCover, applyRowFolder, applyRowPatch, createAnimeCreateRow, rowHasData } from './anime-create.helpers';
import type { AnimeCreateRowDraft, AnimeCreateRowPatch } from './anime-create.types';

/**
 * Owns the batch's editable rows: adding, patching, folder and cover pickers,
 * and the confirm-before-discard flow for a row that already has data.
 *
 * Split out of `useAnimeCreate` on 2026-08-14, where these three state slices
 * and eight callbacks were eleven of its twenty-four hook calls. Nothing here
 * knows about the schedule board or the submit; the only thing it needs from
 * outside is the downloads root a folder patch is resolved against.
 * @param downloadsRoot The configured downloads root, used to resolve folders.
 * @returns The rows plus every editing callback and a reset for after submit.
 */
export function useAnimeCreateRows(downloadsRoot: string) {
  const [rows, setRows] = useState<readonly AnimeCreateRowDraft[]>(() => [createAnimeCreateRow(1)]);
  const [nextRowIndex, setNextRowIndex] = useState(2);
  const [pendingRemoveId, setPendingRemoveId] = useState<string>();
  /** One row's pending Undo, keyed by draftId (design D9) -- absent once undone or never applied. */
  const [appliedMetadataByRow, setAppliedMetadataByRow] = useState<Readonly<Record<string, AppliedMetadata<AnimeCreateRowPatch>>>>({});

  const canRemoveRow = rows.length > ANIME_CREATE_MIN_ROWS;
  const isRemoveConfirmOpen = pendingRemoveId !== undefined;

  const onAddRow = useCallback(() => {
    setRows((current) => [...current, createAnimeCreateRow(nextRowIndex)]);
    setNextRowIndex((current) => current + 1);
  }, [nextRowIndex]);
  const removeRowNow = useCallback((draftId: string) => {
    setRows((current) => (current.length <= ANIME_CREATE_MIN_ROWS ? current : current.filter((row) => row.draftId !== draftId)));
  }, []);
  const onRemoveRow = useCallback((draftId: string) => {
    const target = rows.find((row) => row.draftId === draftId);
    if (target !== undefined && rowHasData(target)) {
      setPendingRemoveId(draftId);
      return;
    }
    removeRowNow(draftId);
  }, [removeRowNow, rows]);
  const onConfirmRemove = useCallback(() => {
    if (pendingRemoveId !== undefined) {
      removeRowNow(pendingRemoveId);
    }
    setPendingRemoveId(undefined);
  }, [pendingRemoveId, removeRowNow]);
  const onCancelRemove = useCallback(() => setPendingRemoveId(undefined), []);
  const onRowChange = useCallback((draftId: string, patch: AnimeCreateRowPatch) => {
    setRows((current) => applyRowPatch(current, draftId, patch, downloadsRoot));
  }, [downloadsRoot]);
  /**
   * Applies a confirmed MyAnimeList selection to one row (design D9). Maps
   * the selection through {@link toCreateRowPatch} and applies it through
   * the same `onRowChange` channel the user's own typing uses -- never a
   * separate write path -- so a `name` patch re-derives `folder` exactly as
   * hand-typing would (D10). Records the row's pre-image for `onMetadataUndo`.
   */
  const onMetadataApplied = useCallback((draftId: string, selection: AnimeMetadataSelection) => {
    const row = rows.find((candidate) => candidate.draftId === draftId);
    if (row === undefined) {
      return;
    }
    const patch = toCreateRowPatch(selection);
    const previous = buildUndoPatch(row, patch);
    onRowChange(draftId, patch);
    setAppliedMetadataByRow((current) => ({
      ...current,
      [draftId]: { patch, previous, appliedFields: Object.keys(patch) as (keyof AnimeCreateRowPatch)[], unfilled: selection.unfilled },
    }));
  }, [rows, onRowChange]);
  /**
   * Reverts one row's last applied metadata patch (design D9): replays the
   * recorded pre-image through the same `onRowChange` channel, then clears
   * the row's pending Undo. A no-op when the row has nothing applied.
   */
  const onMetadataUndo = useCallback((draftId: string) => {
    const applied = appliedMetadataByRow[draftId];
    if (applied === undefined) {
      return;
    }
    onRowChange(draftId, applied.previous);
    setAppliedMetadataByRow((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== draftId)));
  }, [appliedMetadataByRow, onRowChange]);
  const onBrowseFolder = useCallback((draftId: string) => {
    void bridgeRuntimeSource.pickFolder?.('Select anime folder').then((folder) => {
      setRows((current) => applyRowFolder(current, draftId, folder));
    });
  }, []);
  const onBrowseCover = useCallback((draftId: string) => {
    void bridgeRuntimeSource.pickFile?.('Select cover image').then((path) => {
      setRows((current) => applyRowCover(current, draftId, path));
    });
  }, []);
  const resetRows = useCallback(() => {
    setRows([createAnimeCreateRow(1)]);
    setNextRowIndex(2);
  }, []);

  return {
    rows,
    canRemoveRow,
    isRemoveConfirmOpen,
    appliedMetadataByRow,
    metadataLookupSource,
    onAddRow,
    onRemoveRow,
    onConfirmRemove,
    onCancelRemove,
    onRowChange,
    onMetadataApplied,
    onMetadataUndo,
    onBrowseFolder,
    onBrowseCover,
    resetRows,
  };
}
