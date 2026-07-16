import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type { AnimeDetail } from '../../../../shared/contracts/anime.types';
import {
  hasPreviousHistoryEntry,
  toAnimeDetailViewModel,
} from './anime-detail.helpers';
import type {
  AnimeDetailLoadSnapshot,
  AnimeDetailProps,
  AnimeDetailState,
} from './anime-detail.types';
import { useAnimeDetailMutation } from './use-anime-detail-mutation';

/**
 * Drives the shared AnimeDetail component by fetching a single anime's rich
 * detail (including repetition history) from the runtime. `undefined` means
 * "still loading"; `null` means "not found" (also the degrade-to-null result
 * when the Wails runtime/binding is unavailable, mirroring
 * `bridgeRuntimeSource.getAnimeDetail`'s own degradation).
 */
export function useAnimeDetail(
  props: Readonly<AnimeDetailProps>,
  source: BridgeRuntimeSource = bridgeRuntimeSource,
): AnimeDetailState {
  // 1. Refs

  // 2. State
  const [detailSnapshot, setDetailSnapshot] = useState<AnimeDetailLoadSnapshot | undefined>(undefined);
  const [failedPortadaAnimeId, setFailedPortadaAnimeId] = useState<string | undefined>(undefined);

  // 3. Context/3rd Party Hooks
  const navigate = useNavigate();
  const mutation = useAnimeDetailMutation({
    animeId: props.animeId,
    detailSnapshot,
    source,
    setDetailSnapshot,
  });

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const detail: AnimeDetail | null | undefined = detailSnapshot?.animeId === props.animeId
    ? detailSnapshot.detail
    : undefined;
  const loadState = useMemo<AnimeDetailState['loadState']>(() => {
    if (detail === undefined) {
      return 'loading';
    }

    return detail === null ? 'not-found' : 'loaded';
  }, [detail]);
  const viewModel = useMemo(
    () => (detail ? toAnimeDetailViewModel(detail) : undefined),
    [detail],
  );
  const showPortadaPlaceholder = failedPortadaAnimeId === props.animeId || viewModel?.portadaUrl === undefined;

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
  useEffect(() => {
    let active = true;

    void source
      .getAnimeDetail(props.animeId)
      .then((result) => {
        if (!active) {
          return;
        }

        setDetailSnapshot({ animeId: props.animeId, detail: result });
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setDetailSnapshot({ animeId: props.animeId, detail: null });
      });

    return () => {
      active = false;
    };
  }, [props.animeId, source]);

  return {
    loadState,
    detail: viewModel,
    showPortadaPlaceholder,
    confirmation: mutation.confirmation,
    feedback: mutation.feedback,
    isMutating: mutation.isMutating,
    onPortadaError,
    onPortadaLoad,
    onBack,
    onEditAnime,
    onRequestRepeat: mutation.onRequestRepeat,
    onRequestRestore: mutation.onRequestRestore,
    onCancelAction: mutation.onCancelAction,
    onConfirmationOpenChange: mutation.onConfirmationOpenChange,
    onConfirmAction: mutation.onConfirmAction,
  };
}
