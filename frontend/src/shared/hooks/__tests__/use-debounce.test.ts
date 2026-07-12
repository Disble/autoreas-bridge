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

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 100));

    expect(result.current).toBe('hello');
  });

  it('does not update the debounced value before the delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 100), {
      initialProps: { value: 'hello' },
    });

    rerender({ value: 'world' });

    expect(result.current).toBe('hello');
  });

  it('updates the debounced value after the delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 50), {
      initialProps: { value: 'hello' },
    });

    rerender({ value: 'world' });
    act(() => vi.advanceTimersByTime(50));

    expect(result.current).toBe('world');
  });

  it('resets the timer when the value changes rapidly', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 50), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'ab' });
    act(() => vi.advanceTimersByTime(30));
    rerender({ value: 'abc' });
    act(() => vi.advanceTimersByTime(30));

    expect(result.current).toBe('a');

    act(() => vi.advanceTimersByTime(50));

    expect(result.current).toBe('abc');
  });
});
