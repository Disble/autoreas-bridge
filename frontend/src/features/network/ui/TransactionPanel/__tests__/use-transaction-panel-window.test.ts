import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CaptureRow } from '../../../../../shared/contracts/capture.types';
import { useTransactionPanelWindow } from '../use-transaction-panel-window';

/** Builds one capture row, overridable field by field per test. */
function row(overrides: Partial<CaptureRow> = {}): CaptureRow {
  return {
    requestId: 'req-1',
    capturedAtMs: 1_000,
    kind: 'patch',
    route: '/api/animes/anime-1',
    transport: 'http',
    outcome: 'accepted',
    ...overrides,
  };
}

/** Builds `count` newest-first rows with distinct ids and descending timestamps. */
function rows(count: number, offset = 0): readonly CaptureRow[] {
  return Array.from({ length: count }, (_unused, index) =>
    row({ requestId: `req-${offset + index}`, capturedAtMs: 100_000 - offset - index }),
  );
}

describe('useTransactionPanelWindow', () => {
  it('renders exactly one batch even when more rows are already loaded', () => {
    const { result } = renderHook(() =>
      useTransactionPanelWindow({ items: rows(60), selectedId: null, onReachEnd: vi.fn() }),
    );

    // 25 is TRANSACTION_PAGE_INITIAL_COUNT, written as a literal on purpose:
    // asserting against the production constant would pass whatever it became.
    expect(result.current.visibleCount).toBe(25);
    expect(result.current.visibleItems).toHaveLength(25);
  });

  it('grows by one batch on load-more without asking the backend while loaded rows are still hidden', () => {
    const onReachEnd = vi.fn();
    const { result } = renderHook(() => useTransactionPanelWindow({ items: rows(60), selectedId: null, onReachEnd }));

    act(() => {
      result.current.onLoadMore();
    });

    expect(result.current.visibleCount).toBe(50);
    expect(onReachEnd).not.toHaveBeenCalled();
  });

  it('asks the backend for the next cursor page once the growth consumes the loaded rows', () => {
    const onReachEnd = vi.fn();
    const { result } = renderHook(() => useTransactionPanelWindow({ items: rows(30), selectedId: null, onReachEnd }));

    act(() => {
      result.current.onLoadMore();
    });

    expect(result.current.visibleCount).toBe(30);
    expect(onReachEnd).toHaveBeenCalledTimes(1);
  });

  it('grows the window by exactly one when a capture arrives at the head, so no rendered row drops out of view', () => {
    const loaded = rows(60);
    const { result, rerender } = renderHook(
      (items: readonly CaptureRow[]) => useTransactionPanelWindow({ items, selectedId: null, onReachEnd: vi.fn() }),
      { initialProps: loaded },
    );

    expect(result.current.visibleCount).toBe(25);

    rerender([row({ requestId: 'req-live', capturedAtMs: 200_000 }), ...loaded]);

    // 26, not 25: a head insertion shifts every rendered row down one index, so
    // holding the count constant would silently unmount the bottom visible row
    // on every single push.
    expect(result.current.visibleCount).toBe(26);
    expect(result.current.visibleItems[0]?.requestId).toBe('req-live');
    expect(result.current.visibleItems[25]?.requestId).toBe('req-24');
  });

  it('extends the window down to the selected row so a selection is never unmounted', () => {
    const { result } = renderHook(() =>
      useTransactionPanelWindow({ items: rows(60), selectedId: 'req-40', onReachEnd: vi.fn() }),
    );

    expect(result.current.visibleCount).toBe(41);
  });

  it('never renders more rows than are loaded', () => {
    const { result } = renderHook(() =>
      useTransactionPanelWindow({ items: rows(3), selectedId: null, onReachEnd: vi.fn() }),
    );

    expect(result.current.visibleItems).toHaveLength(3);
  });
});
