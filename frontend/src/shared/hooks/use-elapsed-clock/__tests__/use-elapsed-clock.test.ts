import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useElapsedClock } from '..';

describe('useElapsedClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not tick while hasPending is false', () => {
    const { result } = renderHook(() => useElapsedClock(false));
    const initial = result.current;

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current).toBe(initial);
  });

  it('ticks every 500ms while hasPending is true', () => {
    const { result } = renderHook(() => useElapsedClock(true));
    const initial = result.current;

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBeGreaterThan(initial);

    const afterFirstTick = result.current;

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBeGreaterThan(afterFirstTick);
  });

  it('stops ticking once hasPending flips back to false', () => {
    const { result, rerender } = renderHook(({ hasPending }) => useElapsedClock(hasPending), {
      initialProps: { hasPending: true },
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });
    const tickedValue = result.current;

    rerender({ hasPending: false });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current).toBe(tickedValue);
  });

  it('resumes ticking once hasPending flips back to true', () => {
    const { result, rerender } = renderHook(({ hasPending }) => useElapsedClock(hasPending), {
      initialProps: { hasPending: false },
    });

    const beforeResume = result.current;
    rerender({ hasPending: true });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBeGreaterThan(beforeResume);
  });
});
