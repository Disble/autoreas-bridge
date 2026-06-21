import { useEffect, useState } from 'react';

/**
 * Returns a debounced copy of `value`. The returned value only updates after
 * `delayMs` milliseconds have passed without the input value changing. This is
 * useful for expensive derived computations (e.g. filtering a large list) that
 * should not run on every keystroke.
 */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debounced;
}
