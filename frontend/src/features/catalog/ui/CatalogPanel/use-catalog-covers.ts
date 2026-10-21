import { useCallback, useMemo, useState } from 'react';
import type { AnimeCoverSource } from '../../../../shared/anime-cover/anime-cover.types';
import { useAnimeCoverCache } from '../../../../shared/anime-cover/use-anime-cover-cache';
import { toCatalogCover } from './catalog-panel.helpers';
import type { CatalogCovers, CatalogItemViewModel } from './catalog-panel.types';

/**
 * Resolves the covers of the items the Catalog renders. Only the progressive
 * window is passed in and only records with a stored cover are asked for, so a
 * large catalog costs one lookup per revealed card, never one per anime.
 *
 * @param items The items currently rendered (the progressive window).
 * @param source The port `getAnimeCover` is called through.
 * @returns What each item's cover slot draws, and the decode-failure report.
 */
export function useCatalogCovers(items: readonly CatalogItemViewModel[], source: AnimeCoverSource): CatalogCovers {
  // 1. Refs

  // 2. State
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(new Set());

  // 3. Context/3rd Party Hooks

  // 4. Queries (only the rendered items that report a stored cover are asked for)
  const coverIds = useMemo(() => items.filter((item) => item.hasCover).map((item) => item.id), [items]);
  const covers = useAnimeCoverCache(coverIds, source);

  // 5. Derived State (useMemo)
  const canResolve = source.getAnimeCover !== undefined;

  // 6. Callbacks (useCallback calling pure helpers)
  const getCover = useCallback(
    (item: CatalogItemViewModel) =>
      toCatalogCover({ hasCover: item.hasCover, entry: covers.get(item.id), hasFailed: failedIds.has(item.id), canResolve }),
    [canResolve, covers, failedIds],
  );
  const onCoverError = useCallback((animeId: string) => {
    setFailedIds((previous) => new Set([...previous, animeId]));
  }, []);

  // 7. Effects

  return { getCover, onCoverError };
}
