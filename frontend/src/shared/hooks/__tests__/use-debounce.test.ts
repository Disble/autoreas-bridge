import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebounce } from '../use-debounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value at once, and the latest value only once the delay passes since its last change', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 50), {
      initialProps: { value: 'a' },
    });

    expect(result.current).toBe('a');

    rerender({ value: 'ab' });
    act(() => vi.advanceTimersByTime(30));

    expect(result.current).toBe('a');

    rerender({ value: 'abc' });
    act(() => vi.advanceTimersByTime(49));

    expect(result.current).toBe('a');

    act(() => vi.advanceTimersByTime(1));

    expect(result.current).toBe('abc');
  });
});
