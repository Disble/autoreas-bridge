import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { usePageProgressiveWindow } from '../use-page-progressive-window';

/**
 * Places the page so its bottom edge sits `distance` pixels below the viewport.
 * @param distance Pixels of document left below the visible area.
 */
function placePageBottom(distance: number): void {
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: window.innerHeight + distance });
}

afterEach(() => {
  placePageBottom(0);
});

describe('usePageProgressiveWindow', () => {
  it('reveals one more batch only when the page scrolls near its bottom', () => {
    const { result } = renderHook(() => usePageProgressiveWindow(50, 20, 20));
    expect(result.current.visibleCount).toBe(20);

    placePageBottom(1000);
    act(() => {
      fireEvent.scroll(window);
    });
    expect(result.current.visibleCount).toBe(20);

    placePageBottom(100);
    act(() => {
      fireEvent.scroll(window);
    });
    expect(result.current.visibleCount).toBe(40);

    act(() => {
      fireEvent.scroll(window);
    });
    expect(result.current.visibleCount).toBe(50);
  });

  it('starts over at one batch when the list size changes, and stops listening once unmounted', () => {
    placePageBottom(0);
    const { result, rerender, unmount } = renderHook(({ count }) => usePageProgressiveWindow(count, 20, 20), { initialProps: { count: 100 } });
    act(() => {
      fireEvent.scroll(window);
    });
    expect(result.current.visibleCount).toBe(40);

    rerender({ count: 90 });
    expect(result.current.visibleCount).toBe(20);

    unmount();
    expect(() => fireEvent.scroll(window)).not.toThrow();
  });
});
