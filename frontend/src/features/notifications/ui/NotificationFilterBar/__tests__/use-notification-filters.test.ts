import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_FILTER_DEBOUNCE_MS, useNotificationFilters } from '../use-notification-filters';

describe('useNotificationFilters', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reflects typed input immediately, but only debounces the query value after the delay elapses', () => {
    const { result } = renderHook(() => useNotificationFilters());

    act(() => {
      result.current.onSearchInputChange('one piece');
    });

    // SearchField has no built-in debounce (design.md §9.2): the raw input
    // updates at once, but the debounced value a query is built from must
    // NOT move yet.
    expect(result.current.searchInput).toBe('one piece');
    expect(result.current.debouncedSearch).toBe('');

    act(() => {
      vi.advanceTimersByTime(NOTIFICATION_FILTER_DEBOUNCE_MS - 1);
    });
    expect(result.current.debouncedSearch).toBe('');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.debouncedSearch).toBe('one piece');
  });

  it('resets the debounce window on every keystroke, matching a real typed sequence', () => {
    const { result } = renderHook(() => useNotificationFilters());

    act(() => {
      result.current.onSearchInputChange('o');
    });
    act(() => {
      vi.advanceTimersByTime(NOTIFICATION_FILTER_DEBOUNCE_MS - 1);
    });
    act(() => {
      result.current.onSearchInputChange('on');
    });
    act(() => {
      vi.advanceTimersByTime(NOTIFICATION_FILTER_DEBOUNCE_MS - 1);
    });

    expect(result.current.debouncedSearch).toBe('');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.debouncedSearch).toBe('on');
  });
});
