import { useCallback, useEffect, useRef, useState } from 'react';

import type { UseAsyncListResult } from './use-async-list.types';

/**
 * Normalizes an unknown rejection reason into an Error so consumers can render
 * a message without re-deriving the shape of every runtime failure.
 */
function toLoadError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

/**
 * Loads a runtime-backed list and degrades failures to an empty result while
 * preventing an unmounted consumer from receiving a late state update.
 */
export function useAsyncList<T>(
  load: () => Promise<readonly T[]>,
  refreshKey?: unknown,
  sourceKey?: unknown,
): UseAsyncListResult<T> {
  // 1. Refs
  const loadRef = useRef(load);

  // 2. State
  const [items, setItems] = useState<readonly T[]>([]);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [resolvedKeys, setResolvedKeys] = useState<{ readonly refreshKey: unknown; readonly sourceKey: unknown }>({
    refreshKey: Symbol('initial-refresh-key'),
    sourceKey: Symbol('initial-source-key'),
  });
  const [settledVersion, setSettledVersion] = useState(-1);

  // 3. Context/3rd Party Hooks
  const reload = useCallback(() => {
    setReloadVersion((previous) => previous + 1);
  }, []);

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    let active = true;

    // Every fresh request starts from a clean error, so a stale failure can
    // never survive a reload, a refresh key change, or a source swap.
    setError(undefined);

    void loadRef.current()
      .then((nextItems) => {
        if (active) {
          setItems(nextItems);
          setError(undefined);
          setResolvedKeys({ refreshKey, sourceKey });
          setSettledVersion(reloadVersion);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setItems([]);
          setError(toLoadError(reason));
          setResolvedKeys({ refreshKey, sourceKey });
          setSettledVersion(reloadVersion);
        }
      });

    return () => {
      active = false;
    };
  }, [refreshKey, reloadVersion, sourceKey]);

  const isLoading = settledVersion !== reloadVersion || resolvedKeys.refreshKey !== refreshKey || resolvedKeys.sourceKey !== sourceKey;

  return { items, isLoading, error, reload };
}
