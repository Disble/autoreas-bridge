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
  const loadRef = useRef(load);
  const [items, setItems] = useState<readonly T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadVersion, setReloadVersion] = useState(0);
  const reload = useCallback(() => {
    setReloadVersion((previous) => previous + 1);
  }, []);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    let active = true;

    setIsLoading(true);

    void loadRef.current()
      .then((nextItems) => {
        if (active) {
          setItems(nextItems);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setItems([]);
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [refreshKey, reloadVersion, sourceKey]);

  return { items, isLoading, reload };
}
