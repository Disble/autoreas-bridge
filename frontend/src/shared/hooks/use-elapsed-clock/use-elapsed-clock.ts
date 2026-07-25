import { useEffect, useRef, useState } from 'react';
import { ELAPSED_CLOCK_TICK_MS } from './use-elapsed-clock.constants';

/**
 * Returns a ticking clock value (epoch ms) that advances every
 * `ELAPSED_CLOCK_TICK_MS` while `hasPending` is true, and holds its last
 * value (no wasted re-renders) once `hasPending` is false. Consumers derive
 * a pending row's live elapsed time as `now - row.capturedAtMs`.
 */
export function useElapsedClock(hasPending: boolean): number {
  // 1. Refs
  const intervalIdRef = useRef<number | null>(null);

  // 2. State
  const [now, setNow] = useState<number>(() => Date.now());

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects
  useEffect(() => {
    if (!hasPending) {
      return undefined;
    }

    intervalIdRef.current = window.setInterval(() => {
      setNow(Date.now());
    }, ELAPSED_CLOCK_TICK_MS);

    return () => {
      if (intervalIdRef.current !== null) {
        window.clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };
  }, [hasPending]);

  return now;
}
