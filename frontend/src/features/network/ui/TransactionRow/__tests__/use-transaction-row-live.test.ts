import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ELAPSED_CLOCK_TICK_MS } from '../../../../../shared/hooks/use-elapsed-clock/use-elapsed-clock.constants';
import { TRANSACTION_STALE_PENDING_THRESHOLD_MS } from '../../../../../shared/store/transaction-store/transaction-store.constants';
import { useTransactionRowLive } from '../use-transaction-row-live';

describe('useTransactionRowLive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('advances the elapsed duration while the request is outstanding', () => {
    const capturedAtMs = Date.now();
    const { result } = renderHook(() => useTransactionRowLive(capturedAtMs));

    expect(result.current?.durationLabel).toBe('0ms');

    act(() => {
      vi.advanceTimersByTime(ELAPSED_CLOCK_TICK_MS);
    });

    expect(result.current?.durationLabel).toBe('500ms');

    act(() => {
      vi.advanceTimersByTime(ELAPSED_CLOCK_TICK_MS);
    });

    expect(result.current?.durationLabel).toBe('1.0s');
  });

  it('presents an outstanding row as pending rather than as its settled outcome', () => {
    const { result } = renderHook(() => useTransactionRowLive(Date.now()));

    expect(result.current?.outcome).toBe('pending');
    expect(result.current?.outcomeColor).toBe('accent');
  });

  it('runs exactly one interval per outstanding row', () => {
    renderHook(() => useTransactionRowLive(Date.now()));

    expect(vi.getTimerCount()).toBe(1);
  });

  it('stops its clock and hands the row back to its settled presentation once it ages past the staleness window', () => {
    const capturedAtMs = Date.now() - TRANSACTION_STALE_PENDING_THRESHOLD_MS + ELAPSED_CLOCK_TICK_MS;
    const { result } = renderHook(() => useTransactionRowLive(capturedAtMs));

    expect(result.current).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(ELAPSED_CLOCK_TICK_MS);
    });

    expect(result.current).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never starts a clock for a row that is already past the staleness window', () => {
    const { result } = renderHook(() => useTransactionRowLive(Date.now() - TRANSACTION_STALE_PENDING_THRESHOLD_MS));

    expect(result.current).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases its interval when the row unmounts', () => {
    const { unmount } = renderHook(() => useTransactionRowLive(Date.now()));

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
