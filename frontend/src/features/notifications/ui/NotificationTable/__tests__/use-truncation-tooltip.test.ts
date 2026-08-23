import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTruncationTooltip } from '../use-truncation-tooltip';

/** A minimal stand-in for the measured element -- only the two dimensions the hook reads. */
function makeMeasurableElement(scrollWidth: number, clientWidth: number) {
  return { scrollWidth, clientWidth } as HTMLSpanElement;
}

describe('useTruncationTooltip', () => {
  it('starts disabled before any DOM measurement is available', () => {
    const { result } = renderHook(() => useTruncationTooltip());

    expect(result.current.isDisabled).toBe(true);
    expect(result.current.ref.current).toBeNull();
  });

  it('keeps isDisabled true when the text is not actually truncated (scrollWidth <= clientWidth)', () => {
    const { rerender, result } = renderHook(() => useTruncationTooltip());

    act(() => {
      result.current.ref.current = makeMeasurableElement(100, 100);
    });
    rerender();

    expect(result.current.isDisabled).toBe(true);
  });

  it('sets isDisabled to false when the text is actually truncated (scrollWidth > clientWidth), for the tooltip to reveal after its default 700ms delay', () => {
    const { rerender, result } = renderHook(() => useTruncationTooltip());

    act(() => {
      result.current.ref.current = makeMeasurableElement(400, 120);
    });
    rerender();

    expect(result.current.isDisabled).toBe(false);
  });
});
