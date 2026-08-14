import { useCallback, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
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
    onAddRow,
    onRemoveRow,
    onConfirmRemove,
    onCancelRemove,
    onRowChange,
    onBrowseFolder,
    onBrowseCover,
    resetRows,
  };
}
