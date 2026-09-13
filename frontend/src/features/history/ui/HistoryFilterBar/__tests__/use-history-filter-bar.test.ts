import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HISTORY_FILTER_BAR_SEARCH_DEBOUNCE_MS, useHistoryFilterBarSearch } from '../use-history-filter-bar';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useHistoryFilterBarSearch', () => {
  it('updates the draft immediately on every keystroke, then settles debouncedSearch only once the debounce window fully elapses', () => {
    const { result } = renderHook(() => useHistoryFilterBarSearch(''));

    act(() => {
      result.current.onDraftChange('naruto');
    });
    expect(result.current.draft).toBe('naruto');
    expect(result.current.debouncedSearch).toBe('');

    act(() => {
      vi.advanceTimersByTime(HISTORY_FILTER_BAR_SEARCH_DEBOUNCE_MS - 1);
    });
    expect(result.current.debouncedSearch).toBe('');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.debouncedSearch).toBe('naruto');
  });

  it('resyncs the draft to an externally changed committed search, discarding an in-progress edit (design D5 stale-param lesson)', () => {
    const { result, rerender } = renderHook(({ committed }) => useHistoryFilterBarSearch(committed), {
      initialProps: { committed: '' },
    });

    act(() => {
      result.current.onDraftChange('naruto');
    });

    rerender({ committed: 'bleach' });

    expect(result.current.draft).toBe('bleach');

    act(() => {
      vi.advanceTimersByTime(HISTORY_FILTER_BAR_SEARCH_DEBOUNCE_MS);
    });
    expect(result.current.debouncedSearch).toBe('bleach');
  });
});
