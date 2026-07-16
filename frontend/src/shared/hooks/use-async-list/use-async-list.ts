import { useCallback, useEffect, useRef, useState } from 'react';

import type { UseAsyncListResult } from './use-async-list.types';

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

    void loadRef.current()
      .then((nextItems) => {
        if (active) {
          setItems(nextItems);
          setResolvedKeys({ refreshKey, sourceKey });
          setSettledVersion(reloadVersion);
        }
      })
      .catch(() => {
        if (active) {
          setItems([]);
          setResolvedKeys({ refreshKey, sourceKey });
          setSettledVersion(reloadVersion);
        }
      });

    return () => {
      active = false;
    };
  }, [refreshKey, reloadVersion, sourceKey]);

  const isLoading = settledVersion !== reloadVersion || resolvedKeys.refreshKey !== refreshKey || resolvedKeys.sourceKey !== sourceKey;

  return { items, isLoading, reload };
}
