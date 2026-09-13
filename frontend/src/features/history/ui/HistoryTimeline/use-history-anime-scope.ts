import { useEffect, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type { Anime } from '../../../../shared/contracts/anime.types';
import type { HistoryAnimeScope } from '../HistoryFilterBar/history-filter-bar.types';
import { resolveHistoryAnimeScope } from './history-timeline.helpers';

/**
 * Loads the anime catalog via `getAnimes()` once per History visit and
 * resolves the active Status/Type filter against it (design D2), so
 * `useHistoryTimeline` itself only has to read the result. Returns
 * `undefined` until the catalog has resolved -- callers gate their first
 * page fetch on that, since `isLoading` covers the catalog load too
 * (CLAUDE.md FE #14).
 */
export function useHistoryAnimeScope(
  status: number | undefined,
  type: number | undefined,
  source: BridgeRuntimeSource = bridgeRuntimeSource,
): HistoryAnimeScope | undefined {
  // 2. State
  const [catalog, setCatalog] = useState<readonly Anime[] | undefined>(undefined);

  // 5. Derived State (useMemo)
  const scope = useMemo(
    () => (catalog === undefined ? undefined : resolveHistoryAnimeScope(catalog, status, type)),
    [catalog, status, type],
  );

  // 7. Effects
  useEffect(() => {
    let isActive = true;

    source
      .getAnimes()
      .then((items) => {
        if (isActive) {
          setCatalog(items);
        }
      })
      .catch(() => {
        if (isActive) {
          setCatalog([]);
        }
      });

    return () => {
      isActive = false;
    };
    // Loads once per History visit (design D2). `source` is intentionally NOT
    // listed: loading once per mount must not, by itself, depend on a fake
    // swapped mid-test.
    // eslint-disable-next-line react-doctor/exhaustive-deps
  }, []);

  return scope;
}
