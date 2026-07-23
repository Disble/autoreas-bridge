import { useCallback, useEffect, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source';
import { preferencesSource } from '../../../../infrastructure/preferences-source/preferences-source.helpers';
import type { AnimeEditorScheduleBoard } from '../../../../shared/contracts/anime.types';
import { isValidDownloadPageUrl } from '../../../../shared/helpers/url.helpers';
import type { AnimeScheduleOrderingCreateSubmit } from '../../../anime-schedule-ordering/ui/AnimeScheduleOrdering/anime-schedule-ordering.types';
import { ANIME_CREATE_MIN_ROWS, ANIME_CREATE_RUNTIME_UNAVAILABLE_MESSAGE } from './anime-create.constants';
import { applyRowCover, applyRowFolder, applyRowPatch, buildAnimeCreateCommand, createAnimeCreateRow, rowHasData, validateAnimeCreateRows } from './anime-create.helpers';
import type { AnimeCreateRowDraft, AnimeCreateRowPatch, AnimeCreateViewModel } from './anime-create.types';

/**
 * Owns the batch-create rows, the shared schedule board fetch, and the single
 * deferred submit that persists the whole batch through `createAnime`.
 */
export function useAnimeCreate(): AnimeCreateViewModel {
  // 1. Refs

  // 2. State
  const [rows, setRows] = useState<readonly AnimeCreateRowDraft[]>(() => [createAnimeCreateRow(1)]);
  const [nextRowIndex, setNextRowIndex] = useState(2);
  const [board, setBoard] = useState<AnimeEditorScheduleBoard>();
  const [feedback, setFeedback] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBoardOpen, setIsBoardOpen] = useState(false);
  const [downloadsRoot, setDownloadsRoot] = useState('');
  const [pendingRemoveId, setPendingRemoveId] = useState<string>();

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const draftEntries = useMemo(() => rows.map((row) => ({ draftId: row.draftId, name: row.name.trim() === '' ? 'New anime' : row.name })), [rows]);
  const lockedAnimeIds = useMemo(() => (board?.entries ?? []).map((entry) => entry.animeId), [board]);
  const canRemoveRow = rows.length > ANIME_CREATE_MIN_ROWS;
  const canOpenBoard = useMemo(() => board !== undefined && rows.every((row) => row.name.trim() !== '' && isValidDownloadPageUrl(row.page)), [board, rows]);
  const isRemoveConfirmOpen = pendingRemoveId !== undefined;

  // 6. Callbacks (useCallback calling pure helpers)
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
  const onOpenBoard = useCallback(() => {
    setFeedback(undefined);
    setIsBoardOpen(true);
  }, []);
  const onCloseBoard = useCallback(() => setIsBoardOpen(false), []);
  const onApplyCreateSubmit = useCallback(async (submit: AnimeScheduleOrderingCreateSubmit) => {
    const validationMessage = validateAnimeCreateRows(rows, submit.creates);
    if (validationMessage !== undefined) {
      setFeedback(validationMessage);
      return;
    }

    setIsSubmitting(true);
    setFeedback(undefined);
    try {
      const command = buildAnimeCreateCommand(rows, submit.creates, submit.changedNeighbors);
      const result = await bridgeRuntimeSource.createAnime?.(command);
      if (result === undefined) {
        setFeedback(ANIME_CREATE_RUNTIME_UNAVAILABLE_MESSAGE);
        return;
      }
      if (result.outcome !== 'applied') {
        setFeedback(result.message);
        return;
      }
      setRows([createAnimeCreateRow(1)]);
      setNextRowIndex(2);
      setIsBoardOpen(false);
      const refreshed = await bridgeRuntimeSource.getAnimeEditorScheduleBoard?.('');
      setBoard(refreshed?.board);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : ANIME_CREATE_RUNTIME_UNAVAILABLE_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }, [rows]);

  // 7. Effects
  useEffect(() => {
    let cancelled = false;
    void bridgeRuntimeSource.getAnimeEditorScheduleBoard?.('').then((result) => {
      if (!cancelled) {
        setBoard(result.board);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    void preferencesSource.getDownloadsRoot().then(setDownloadsRoot);
  }, []);

  return {
    rows,
    board,
    draftEntries,
    lockedAnimeIds,
    feedback,
    isSubmitting,
    canRemoveRow,
    canOpenBoard,
    isBoardOpen,
    isRemoveConfirmOpen,
    onAddRow,
    onRemoveRow,
    onConfirmRemove,
    onCancelRemove,
    onRowChange,
    onBrowseFolder,
    onBrowseCover,
    onOpenBoard,
    onCloseBoard,
    onApplyCreateSubmit,
  };
}
