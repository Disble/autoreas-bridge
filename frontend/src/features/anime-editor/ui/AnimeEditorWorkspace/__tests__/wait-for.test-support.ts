import { waitFor as waitForWithDefaults, type waitForOptions } from '@testing-library/react';

/** How often a hook wait re-checks: a rendered hook mutates no DOM, so only this poll wakes it. */
const HOOK_WAIT_INTERVAL_MS = 5;

/**
 * Testing Library's `waitFor` with a short poll. A `renderHook` container never
 * changes, so the mutation observer that wakes a component wait never fires and
 * every unmet check sleeps the full default 50 ms poll; this re-checks sooner.
 * The timeout and every assertion stay as they are.
 * @param callback The check to retry until it passes.
 * @param options Testing Library wait options; `interval` defaults to the short poll.
 * @returns The callback's result once it passes.
 */
export function waitFor<T>(callback: () => T | Promise<T>, options?: waitForOptions): Promise<T> {
  return waitForWithDefaults(callback, { interval: HOOK_WAIT_INTERVAL_MS, ...options });
}
