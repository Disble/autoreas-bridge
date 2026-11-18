import { useCallback, useMemo, useState } from 'react';
import type { AnimeCreateCommand } from '../../../../shared/contracts/anime.types';
import { BRIDGE_ANIME_EDITOR_SOURCE, BRIDGE_ANIME_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { isValidDownloadPageUrl } from '../../../../shared/helpers/url.helpers';
import type { AnimeScheduleOrderingCreateSubmit } from '../../../../shared/ordering/ui/AnimeScheduleOrdering/anime-schedule-ordering.types';
import { ANIME_CREATE_RUNTIME_UNAVAILABLE_MESSAGE } from './anime-create.constants';
import { buildAnimeCreateCommand, validateAnimeCreateRows } from './anime-create.helpers';
import type { AnimeCreateViewModel } from './anime-create.types';
import { useAnimeCreateBootstrap } from './use-anime-create-bootstrap';
import { useAnimeCreateNameConflicts } from './use-anime-create-name-conflicts';
import { useAnimeCreateRows } from './use-anime-create-rows';

/**
 * Owns the batch-create rows, the shared schedule board read, and the single
 * deferred submit that persists the whole batch through the anime module's
 * `createAnime` mutation.
 *
 * Row editing and the mount-time fetches live in their own hooks. They were
 * split out on 2026-08-14: this function held twenty-four hook calls, eleven of
 * them row editing that knows nothing about the board or the submit. Each
 * row's cover preview renders through the anime module's `previewAnimeCover`.
 */
export function useAnimeCreate(): AnimeCreateViewModel {
  // 1. Refs

  // 2. State
  const [feedback, setFeedback] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBoardOpen, setIsBoardOpen] = useState(false);

  // 3. Context/3rd Party Hooks
  const { board, libraryRoot, reloadBoard } = useAnimeCreateBootstrap();
  const rowState = useAnimeCreateRows(libraryRoot);
  const { rows, resetRows } = rowState;
  const { nameConflicts, hasNameConflict } = useAnimeCreateNameConflicts(rows);

  // 4. Queries/Mutations
  const createMutation = useBridgeMutation({ mutationFn: (command: AnimeCreateCommand) => BRIDGE_ANIME_EDITOR_SOURCE.createAnime(command) });
  const createAnime = createMutation.mutateAsync;

  // 5. Derived State (useMemo)
  const draftEntries = useMemo(() => rows.map((row) => ({ draftId: row.draftId, name: row.name.trim() === '' ? 'New anime' : row.name })), [rows]);
  const lockedAnimeIds = useMemo(() => (board?.entries ?? []).map((entry) => entry.animeId), [board]);
  const canOpenBoard = useMemo(
    () => board !== undefined && !hasNameConflict && rows.every((row) => row.name.trim() !== '' && isValidDownloadPageUrl(row.page)),
    [board, hasNameConflict, rows],
  );

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
      const result = await createAnime(command);
      if (result.outcome !== 'applied') {
        setFeedback(result.message);
        return;
      }
      resetRows();
      setIsBoardOpen(false);
      await reloadBoard();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : ANIME_CREATE_RUNTIME_UNAVAILABLE_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }, [createAnime, reloadBoard, resetRows, rows]);

  // 7. Effects

  return {
    rows,
    board,
    draftEntries,
    lockedAnimeIds,
    nameConflicts,
    appliedMetadataByRow: rowState.appliedMetadataByRow,
    metadataLookupSource: rowState.metadataLookupSource,
    coverPreviewSource: BRIDGE_ANIME_SOURCE,
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
    onMetadataApplied: rowState.onMetadataApplied,
    onMetadataUndo: rowState.onMetadataUndo,
    onBrowseFolder: rowState.onBrowseFolder,
    onBrowseCover: rowState.onBrowseCover,
    onOpenBoard,
    onCloseBoard,
    onApplyCreateSubmit,
  };
}
