import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TransactionStoreFilters } from '../../../../../shared/store/transaction-store/transaction-store.types';
import { useTransactionFilterCallbacks } from '../use-transaction-filter-callbacks';

/** One filter-callback table row: the callback to invoke and the partial filters it must apply. */
interface FilterCallbackCase {
  /** Row name shown by the Vitest runner. */
  readonly name: string;
  /** Invokes the callback under test with a realistic filter input. */
  readonly invoke: (callbacks: ReturnType<typeof useTransactionFilterCallbacks>) => void;
  /** The partial filters the invoked callback must hand to the active setter. */
  readonly expectedFilters: Partial<TransactionStoreFilters>;
}

/**
 * One row per filter control, all through the same act and assert: after the
 * hook re-renders with a NEW setter, each callback must hand its filter to
 * the new setter and never to the old one. A callback captured from the
 * first render (an emptied dependency array) would fail the second
 * assertion, so the table pins the wiring behaviourally.
 */
const FILTER_CALLBACK_CASES: readonly FilterCallbackCase[] = [
  {
    name: 'onRouteChange applies the chosen route',
    invoke: (callbacks) => callbacks.onRouteChange('/api/animes/anime-1'),
    expectedFilters: { route: '/api/animes/anime-1' },
  },
  {
    name: 'onOutcomeChange applies the chosen outcome',
    invoke: (callbacks) => callbacks.onOutcomeChange('accepted'),
    expectedFilters: { outcome: 'accepted' },
  },
  {
    name: 'onKindChange applies the chosen kind',
    invoke: (callbacks) => callbacks.onKindChange('post'),
    expectedFilters: { kind: 'post' },
  },
  {
    name: 'onStatusChange applies the parsed status filter',
    invoke: (callbacks) => callbacks.onStatusChange('404'),
    expectedFilters: { httpStatus: 404 },
  },
  {
    name: 'onSyncDiagnosticsRoute applies the sync diagnostics route',
    invoke: (callbacks) => callbacks.onSyncDiagnosticsRoute(),
    expectedFilters: { route: '/api/sync/diagnostics' },
  },
];

describe('useTransactionFilterCallbacks', () => {
  it.each(FILTER_CALLBACK_CASES)('$name', ({ invoke, expectedFilters }) => {
    const firstSetFilters = vi.fn();
    const secondSetFilters = vi.fn();
    const { rerender, result } = renderHook(({ setFilters }) => useTransactionFilterCallbacks(setFilters), {
      initialProps: { setFilters: firstSetFilters },
    });

    rerender({ setFilters: secondSetFilters });
    invoke(result.current);

    expect(secondSetFilters).toHaveBeenCalledWith(expectedFilters);
    expect(firstSetFilters).not.toHaveBeenCalled();
  });
});
