import { useCallback, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { AnimeEditorScheduleBoard } from '../../../../shared/contracts/anime.types';
import { isValidDownloadPageUrl } from '../../../../shared/helpers/url.helpers';
import type { AnimeScheduleOrderingCreateSubmit } from '../../../../shared/ordering/ui/AnimeScheduleOrdering/anime-schedule-ordering.types';
import { ANIME_CREATE_RUNTIME_UNAVAILABLE_MESSAGE } from './anime-create.constants';
import { buildAnimeCreateCommand, validateAnimeCreateRows } from './anime-create.helpers';
import type { AnimeCreateViewModel } from './anime-create.types';
import { useAnimeCreateBootstrap } from './use-anime-create-bootstrap';
import { useAnimeCreateRows } from './use-anime-create-rows';

/**
 * Owns the batch-create rows, the shared schedule board fetch, and the single
 * deferred submit that persists the whole batch through `createAnime`.
 *
 * Row editing and the mount-time fetches live in their own hooks. They were
 * split out on 2026-08-14: this function held twenty-four hook calls, eleven of
 * them row editing that knows nothing about the board or the submit.
 */
export function useAnimeCreate(): AnimeCreateViewModel {
  // 1. Refs

  // 2. State
  const [board, setBoard] = useState<AnimeEditorScheduleBoard>();
  const [feedback, setFeedback] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBoardOpen, setIsBoardOpen] = useState(false);
  const [downloadsRoot, setDownloadsRoot] = useState('');

  // 3. Context/3rd Party Hooks
  const rowState = useAnimeCreateRows(downloadsRoot);
  const { rows, resetRows } = rowState;

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const draftEntries = useMemo(() => rows.map((row) => ({ draftId: row.draftId, name: row.name.trim() === '' ? 'New anime' : row.name })), [rows]);
  const lockedAnimeIds = useMemo(() => (board?.entries ?? []).map((entry) => entry.animeId), [board]);
  const canOpenBoard = useMemo(() => board !== undefined && rows.every((row) => row.name.trim() !== '' && isValidDownloadPageUrl(row.page)), [board, rows]);

  // 6. Callbacks (useCallback calling pure helpers)
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
      resetRows();
      setIsBoardOpen(false);
      const refreshed = await bridgeRuntimeSource.getAnimeEditorScheduleBoard?.('');
      setBoard(refreshed?.board);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : ANIME_CREATE_RUNTIME_UNAVAILABLE_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }, [resetRows, rows]);

  // 7. Effects
  useAnimeCreateBootstrap(setBoard, setDownloadsRoot);

  return {
    rows,
    board,
    draftEntries,
    lockedAnimeIds,
    feedback,
    isSubmitting,
    canRemoveRow: rowState.canRemoveRow,
    canOpenBoard,
    isBoardOpen,
    isRemoveConfirmOpen: rowState.isRemoveConfirmOpen,
    onAddRow: rowState.onAddRow,
    onRemoveRow: rowState.onRemoveRow,
    onConfirmRemove: rowState.onConfirmRemove,
    onCancelRemove: rowState.onCancelRemove,
    onRowChange: rowState.onRowChange,
    onBrowseFolder: rowState.onBrowseFolder,
    onBrowseCover: rowState.onBrowseCover,
    onOpenBoard,
    onCloseBoard,
    onApplyCreateSubmit,
  };
}
