import { useCallback, useMemo, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import { useAnimeCover } from '../../../../shared/anime-cover/use-anime-cover';
import type { AnimeSource } from '../../../../shared/contracts/anime-source.types';
import { BRIDGE_ANIME_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { animeKeys } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import {
  hasPreviousHistoryEntry,
  toAnimeDetailLoad,
  toAnimeDetailViewModel,
} from './anime-detail.helpers';
import type {
  AnimeDetailCommandSource,
  AnimeDetailProps,
  AnimeDetailState,
} from './anime-detail.types';
import { useAnimeDetailDesktopActions } from './use-anime-detail-desktop-actions';
import { useAnimeDetailMutation } from './use-anime-detail-mutation';

/**
 * Drives the shared AnimeDetail component by reading a single anime's rich
 * detail (including repetition history) through `useBridgeQuery` on the
 * `anime` module, keyed by id: it stays `loading` while the module starts and
 * while the previous anime's detail would still show, an unknown anime is
 * `not-found`, and any other failure (the module failed, a failed read) is
 * `failure` with its reason. Repeat/Restore still run through `commands`, which a
 * later slice moves behind its own port; the desktop actions run through the
 * anime module (`useAnimeDetailDesktopActions`).
 *
 * @param props The anime the page shows.
 * @param source The anime port the detail and cover are read through.
 * @param commands The Repeat/Restore commands.
 * @returns The page state.
 */
export function useAnimeDetail(
  props: Readonly<AnimeDetailProps>,
  source: AnimeSource = BRIDGE_ANIME_SOURCE,
  commands: AnimeDetailCommandSource = bridgeRuntimeSource,
): AnimeDetailState {
  // 1. Refs

  // 2. State
  const [failedPortadaAnimeId, setFailedPortadaAnimeId] = useState<string | undefined>(undefined);

  // 3. Context/3rd Party Hooks
  const navigate = useNavigate();

  // 4. Queries/Mutations
  const query = useBridgeQuery({
    queryKey: animeKeys.key('detail', props.animeId),
    queryFn: () => source.getAnimeDetail(props.animeId),
    module: 'anime',
  });
  const { refetch } = query;
  const refreshDetail = useCallback(async () => (await refetch()).status === 'success', [refetch]);
  const { status, data, error, isFetching, isPlaceholderData } = query;
  const { detail, failureMessage, loadState } = useMemo(
    () => toAnimeDetailLoad({ status, data, error, isFetching, isPlaceholderData }),
    [status, data, error, isFetching, isPlaceholderData],
  );
  const { onCopyFolder, onOpenPage } = useAnimeDetailDesktopActions(props.animeId);
  const mutation = useAnimeDetailMutation({ animeId: props.animeId, detail, commands, refreshDetail });

  // 5. Derived State (useMemo)
  const viewModel = useMemo(
    () => (detail ? toAnimeDetailViewModel(detail) : undefined),
    [detail],
  );
  // useAnimeCover is itself request-sequenced by animeId/hasStoredCover
  // (design D1); a locally failed load (onPortadaError/onPortadaLoad) folds
  // in on top of it here, exactly as the prior showPortadaPlaceholder boolean did.
  const resolvedCover = useAnimeCover(props.animeId, viewModel?.hasStoredCover ?? false, source);
  const cover = failedPortadaAnimeId === props.animeId ? { status: 'placeholder' as const } : resolvedCover;

  // 6. Callbacks (useCallback calling pure helpers)
  const onPortadaError = useCallback(() => {
    setFailedPortadaAnimeId(props.animeId);
  }, [props.animeId]);
  const onPortadaLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    if (event.currentTarget.naturalWidth === 0) {
      setFailedPortadaAnimeId(props.animeId);
    }
  }, [props.animeId]);
  const onBack = useCallback(() => {
    if (hasPreviousHistoryEntry(window.history.state)) {
      void navigate(-1);
    } else {
      void navigate('/history');
    }
  }, [navigate]);
  const onEditAnime = useCallback(() => {
    void navigate(`/editor/${props.animeId}`);
  }, [navigate, props.animeId]);

  // 7. Effects

  return {
    loadState,
    failureMessage,
    detail: viewModel,
    detailSource: detail,
    cover,
    confirmation: mutation.confirmation,
    feedback: mutation.feedback,
    isMutating: mutation.isMutating,
    onPortadaError,
    onPortadaLoad,
    onBack,
    onEditAnime,
    onCopyFolder,
    onOpenPage,
    onRequestRepeat: mutation.onRequestRepeat,
    onRequestRestore: mutation.onRequestRestore,
    onCancelAction: mutation.onCancelAction,
    onConfirmationOpenChange: mutation.onConfirmationOpenChange,
    onConfirmAction: mutation.onConfirmAction,
  };
}
