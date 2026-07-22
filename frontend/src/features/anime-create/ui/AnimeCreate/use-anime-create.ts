import { useCallback, useEffect, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source';
import type { AnimeEditorScheduleBoard } from '../../../../shared/contracts/anime.types';
import type { AnimeScheduleOrderingCreateSubmit } from '../../../anime-schedule-ordering/ui/AnimeScheduleOrdering/anime-schedule-ordering.types';
import { ANIME_CREATE_MIN_ROWS, ANIME_CREATE_RUNTIME_UNAVAILABLE_MESSAGE } from './anime-create.constants';
import { applyRowFolder, buildAnimeCreateCommand, createAnimeCreateRow, validateAnimeCreateRows } from './anime-create.helpers';
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

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const draftEntries = useMemo(() => rows.map((row) => ({ draftId: row.draftId, name: row.name.trim() === '' ? 'New anime' : row.name })), [rows]);
  const lockedAnimeIds = useMemo(() => (board?.entries ?? []).map((entry) => entry.animeId), [board]);
  const canRemoveRow = rows.length > ANIME_CREATE_MIN_ROWS;

  // 6. Callbacks (useCallback calling pure helpers)
  const onAddRow = useCallback(() => {
    setRows((current) => [...current, createAnimeCreateRow(nextRowIndex)]);
    setNextRowIndex((current) => current + 1);
  }, [nextRowIndex]);
  const onRemoveRow = useCallback((draftId: string) => {
    setRows((current) => (current.length <= ANIME_CREATE_MIN_ROWS ? current : current.filter((row) => row.draftId !== draftId)));
  }, []);
  const onRowChange = useCallback((draftId: string, patch: AnimeCreateRowPatch) => {
    setRows((current) => current.map((row) => (row.draftId === draftId ? { ...row, ...patch } : row)));
  }, []);
  const onBrowseFolder = useCallback((draftId: string) => {
    void bridgeRuntimeSource.pickFolder?.('Select anime folder').then((folder) => {
      setRows((current) => applyRowFolder(current, draftId, folder));
    });
  }, []);
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

  return {
    rows,
    board,
    draftEntries,
    lockedAnimeIds,
    feedback,
    isSubmitting,
    canRemoveRow,
    onAddRow,
    onRemoveRow,
    onRowChange,
    onBrowseFolder,
    onApplyCreateSubmit,
  };
}
