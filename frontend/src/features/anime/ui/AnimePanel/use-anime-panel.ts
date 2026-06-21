import { useEffect, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source';
import type { Anime } from '../../../../shared/contracts/anime.types';
import { sortAnimesByName, toAnimeViewModel } from './anime-panel.helpers';
import type { AnimePanelProps, AnimeViewModel } from './anime-panel.types';

/** Drives the AnimePanel by fetching the full anime catalog from the runtime. */
export function useAnimePanel(
  _props: Readonly<AnimePanelProps>,
  source: BridgeRuntimeSource = bridgeRuntimeSource,
) {
  // 1. Refs

  // 2. State
  const [items, setItems] = useState<readonly Anime[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const viewItems = useMemo<readonly AnimeViewModel[]>(
    () => items.toSorted(sortAnimesByName).map(toAnimeViewModel),
    [items],
  );
  const isEmpty = useMemo(() => !isLoading && viewItems.length === 0, [isLoading, viewItems.length]);

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects
  useEffect(() => {
    let active = true;

    setIsLoading(true);

    void source
      .getAnimes()
      .then((nextItems) => {
        if (!active) {
          return;
        }

        setItems(nextItems);
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setItems([]);
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [source]);

  return {
    items: viewItems,
    isLoading,
    isEmpty,
  };
}
