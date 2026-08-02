import { useEffect, useState } from 'react';
import { ELAPSED_CLOCK_TICK_MS } from './use-elapsed-clock.constants';

/**
 * Returns a ticking clock value (epoch ms) that advances every
 * `ELAPSED_CLOCK_TICK_MS` while `isPendingAt` reports work still in flight, and
 * holds its last value (no wasted re-renders) once it does not. Consumers derive
 * a pending row's live elapsed time as `now - row.capturedAtMs`.
 *
 * `isPendingAt` is a predicate over the clock's own value rather than a plain
 * boolean, because whether work still counts as in flight can itself depend on
 * how much time has passed — a row stranded in a pending state stops being live
 * once it ages out. A boolean computed before the clock exists could never
 * observe that transition, so the clock could never stop.
 */
export function useElapsedClock(isPendingAt: (now: number) => boolean): number {
  // 1. Refs

  // 2. State
  const [now, setNow] = useState<number>(() => Date.now());

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const isTicking = isPendingAt(now);

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects
  useEffect(() => {
    if (!isTicking) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, ELAPSED_CLOCK_TICK_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isTicking]);

  return now;
}
