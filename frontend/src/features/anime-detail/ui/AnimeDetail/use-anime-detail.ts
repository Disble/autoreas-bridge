import { useEffect, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source';
import type { AnimeDetail } from '../../../../shared/contracts/anime.types';
import { toAnimeDetailViewModel } from './anime-detail.helpers';
import type { AnimeDetailProps, AnimeDetailState } from './anime-detail.types';

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
  const [detail, setDetail] = useState<AnimeDetail | null | undefined>(undefined);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
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

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects
  useEffect(() => {
    let active = true;

    setDetail(undefined);

    void source
      .getAnimeDetail(props.animeId)
      .then((result) => {
        if (!active) {
          return;
        }

        setDetail(result);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setDetail(null);
      });

    return () => {
      active = false;
    };
  }, [props.animeId, source]);

  return {
    loadState,
    detail: viewModel,
  };
}
