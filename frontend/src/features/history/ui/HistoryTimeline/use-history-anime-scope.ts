import { useEffect, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type { Anime } from '../../../../shared/contracts/anime.types';
import { resolveHistoryAnimeScope } from './history-timeline.helpers';
import type { HistoryAnimeScopeLoadState } from './history-timeline.types';

/**
 * Loads the anime catalog via `getAnimes()` once per History visit and
 * resolves the active Status/Type filter against it (design D2), so
 * `useHistoryTimeline` itself only has to read the result. Returns
 * `undefined` until the catalog has resolved. A rejection remains an explicit
 * error, so the History surface never renders a failed read as empty.
 */
export function useHistoryAnimeScope(
  status: number | undefined,
  type: number | undefined,
  source: BridgeRuntimeSource = bridgeRuntimeSource,
): HistoryAnimeScopeLoadState {
  // 2. State
  const [catalog, setCatalog] = useState<readonly Anime[] | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);

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
          setError(undefined);
        }
      })
      .catch((reason: unknown) => {
        if (isActive) {
          setError(reason instanceof Error ? reason : new Error('Anime catalog request failed'));
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

  return { catalog, scope, error };
}
