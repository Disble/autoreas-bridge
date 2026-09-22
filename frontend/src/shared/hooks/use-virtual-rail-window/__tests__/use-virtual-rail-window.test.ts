import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VirtualRailWindowModel } from '../use-virtual-rail-window.types';
import { useVirtualRailWindow } from '../use-virtual-rail-window';

/**
 * Platform-level viewport contract of the shared virtual rail window: the
 * synchronous measurement, the deterministic zero-height fallback, the
 * ResizeObserver lifecycle (including a missing observer and a null target
 * window). These rows moved here verbatim from the Transactions rail's
 * viewport suite when the mechanism was extracted — they are properties of
 * the shared window, not of any one rail, and every rail that mounts the hook
 * inherits them.
 */

/**
 * Row-height estimate the virtual window runs on, in px. Must mirror
 * VIRTUAL_RAIL_ROW_HEIGHT_ESTIMATE_PX: written as a literal on purpose so the
 * spacer math these tests pin cannot drift with the production constant.
 */
const ROW_HEIGHT_PX = 36;

/** Minimal row shape the generic hook needs for these assertions: only a stable identity. */
interface WindowRow {
  readonly id: string;
}

/** Builds `count` newest-first rows with distinct ids, as one backend page. */
function rows(count: number, offset = 0): readonly WindowRow[] {
  return Array.from({ length: count }, (_unused, index) => ({ id: `req-${offset + index}` }));
}

/** Attaches a detached scroll container to the hook's scrollRef so the virtualizer can observe it. */
function attachScroller(result: { current: Pick<VirtualRailWindowModel<WindowRow>, 'scrollRef'> }): HTMLDivElement {
  const element = document.createElement('div');

  act(() => {
    result.current.scrollRef(element);
  });

  return element;
}

/**
 * A jsdom-compatible `ResizeObserver` double: jsdom has no ResizeObserver at
 * all, so the stub records the instances the hook creates and lets a test
 * drive the resize callbacks a real engine would fire.
 */
class ResizeObserverStub {
  /** Instances created while the stub is installed, in creation order. */
  static readonly instances: ResizeObserverStub[] = [];

  /** The production callback to invoke for a simulated resize. */
  private readonly callback: ResizeObserverCallback;

  /** Elements `observe` was called with, in order. */
  readonly observed: Element[] = [];

  /** The options object each `observe` call received, aligned with `observed`. */
  readonly observedOptions: (ResizeObserverOptions | undefined)[] = [];

  /** Elements `unobserve` was called with, in order. */
  readonly unobserved: Element[] = [];

  /** Records the production callback and registers the instance. */
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverStub.instances.push(this);
  }

  /** Records the observed element and the exact options the caller passed. */
  observe(element: Element, options?: ResizeObserverOptions): void {
    this.observed.push(element);
    this.observedOptions.push(options);
  }

  /** Records the unobserved element, exactly like the real observer. */
  unobserve(element: Element): void {
    this.unobserved.push(element);
  }

  /** Disconnect is a no-op for the double. */
  disconnect(): void {}

  /** Fires the registered production callback, exactly like a real resize. */
  emitResize(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

describe('useVirtualRailWindow viewport', () => {
  it('mounts the rows the measured viewport fits instead of the deterministic fallback', () => {
    const { result } = renderHook(() =>
      useVirtualRailWindow<WindowRow>({
        estimateSizePx: ROW_HEIGHT_PX,
        items: rows(60),
        onReachEnd: vi.fn(),
        overscan: 5,
        prependCount: 0,
      }),
    );

    const element = document.createElement('div');
    Object.defineProperty(element, 'offsetHeight', { configurable: true, value: 1_080 });

    act(() => {
      result.current.scrollRef(element);
    });

    // 1080 px fits 30 rows; the top overscan band clamps at the rail start
    // and the bottom one adds 5: indexes 0..34 → 35 rows. The fallback
    // 600 px viewport would mount 22 — this exact count is what makes the
    // real measurement observable.
    expect(result.current.visibleItems).toHaveLength(35);
    expect(result.current.visibleItems[0]?.id).toBe('req-0');
  });

  it('mounts the deterministic fallback window while a zero-height rail waits for layout', () => {
    const { result } = renderHook(() =>
      useVirtualRailWindow<WindowRow>({
        estimateSizePx: ROW_HEIGHT_PX,
        items: rows(60),
        onReachEnd: vi.fn(),
        overscan: 5,
        prependCount: 0,
      }),
    );

    attachScroller(result);

    // The bare jsdom element measures 0 px high; the fallback viewport keeps
    // 600 px / 36 px = 17 rows plus both overscan bands mounted, so the rail
    // is never empty while it waits for a real measurement.
    expect(result.current.visibleItems).toHaveLength(22);
  });

  it('does not page when a resize grows the window onto the last loaded row without a scroll', () => {
    const onReachEnd = vi.fn();
    const { result } = renderHook(() =>
      useVirtualRailWindow<WindowRow>({
        estimateSizePx: ROW_HEIGHT_PX,
        items: rows(30),
        onReachEnd,
        overscan: 5,
        prependCount: 0,
      }),
    );

    // jsdom has no layout, so the offset size IS the rect the virtualizer
    // measures. A 1080 px rail fits all 30 rows, so attaching it re-measures
    // the range from the 600 px initial window (rows 0-21) onto the LAST
    // loaded row (0-29) with isScrolling false — a resize, not a scroll, and
    // a measurement-driven pass must not page the rail on its own.
    const element = document.createElement('div');
    Object.defineProperty(element, 'offsetHeight', { configurable: true, value: 30 * ROW_HEIGHT_PX });

    act(() => {
      result.current.scrollRef(element);
    });

    expect(onReachEnd).not.toHaveBeenCalled();
  });

  it('follows a later resize measurement through the same viewport path', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);

    try {
      ResizeObserverStub.instances.length = 0;

      const { result } = renderHook(() =>
        useVirtualRailWindow<WindowRow>({
          estimateSizePx: ROW_HEIGHT_PX,
          items: rows(60),
          onReachEnd: vi.fn(),
          overscan: 5,
          prependCount: 0,
        }),
      );
      const element = attachScroller(result);

      expect(result.current.visibleItems).toHaveLength(22);

      Object.defineProperty(element, 'offsetHeight', { configurable: true, value: 1_080 });

      act(() => {
        ResizeObserverStub.instances[0]?.emitResize();
      });

      expect(result.current.visibleItems).toHaveLength(35);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('stops observing the scroller once the rail unmounts', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);

    try {
      ResizeObserverStub.instances.length = 0;

      const { result, unmount } = renderHook(() =>
        useVirtualRailWindow<WindowRow>({
          estimateSizePx: ROW_HEIGHT_PX,
          items: rows(3),
          onReachEnd: vi.fn(),
          overscan: 5,
          prependCount: 0,
        }),
      );
      const element = attachScroller(result);

      expect(ResizeObserverStub.instances[0]?.observed[0]).toBe(element);

      // The rail must be measured as the box the user sees: the options
      // object itself, not a truthy fragment of it.
      expect(ResizeObserverStub.instances[0]?.observedOptions[0]).toEqual({ box: 'border-box' });

      unmount();

      expect(ResizeObserverStub.instances[0]?.unobserved[0]).toBe(element);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('mounts the measured first window with ResizeObserver absent instead of throwing', () => {
    vi.stubGlobal('ResizeObserver', undefined);

    // Uncaught failures inside the observer path surface as window error
    // events; collecting them makes "must not throw" an assertion, not an
    // implication of the test simply finishing.
    const errors: ErrorEvent[] = [];
    const onError = (event: ErrorEvent): void => {
      errors.push(event);
    };

    window.addEventListener('error', onError);

    try {
      const { result } = renderHook(() =>
        useVirtualRailWindow<WindowRow>({
          estimateSizePx: ROW_HEIGHT_PX,
          items: rows(60),
          onReachEnd: vi.fn(),
          overscan: 5,
          prependCount: 0,
        }),
      );

      const element = document.createElement('div');
      Object.defineProperty(element, 'offsetHeight', { configurable: true, value: 1_080 });

      act(() => {
        result.current.scrollRef(element);
      });

      // Same math as the measured-viewport test: 1080 px fits 30 rows and
      // the overscan bands add 5 → 35 rows. The hook measures synchronously
      // BEFORE it checks for an observer, so a rail whose engine offers no
      // ResizeObserver must still mount exactly this window — and the
      // missing-observer branch must return without constructing anything.
      expect(result.current.visibleItems).toHaveLength(35);
      expect(result.current.visibleItems[0]?.id).toBe('req-0');

      expect(errors).toEqual([]);
    } finally {
      window.removeEventListener('error', onError);
      vi.unstubAllGlobals();
    }
  });

  it('mounts the measured first window for a scroller whose document has no default view', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);

    // Uncaught failures inside the observer path surface as window error
    // events; collecting them makes "must not throw" an assertion, not an
    // implication of the test simply finishing.
    const errors: ErrorEvent[] = [];
    const onError = (event: ErrorEvent): void => {
      errors.push(event);
    };

    window.addEventListener('error', onError);

    try {
      ResizeObserverStub.instances.length = 0;

      const { result } = renderHook(() =>
        useVirtualRailWindow<WindowRow>({
          estimateSizePx: ROW_HEIGHT_PX,
          items: rows(60),
          onReachEnd: vi.fn(),
          overscan: 5,
          prependCount: 0,
        }),
      );

      // A `createHTMLDocument` document never enters a browsing context, so
      // its elements carry `ownerDocument.defaultView === null` — and
      // virtual-core still calls the rect observer with that null
      // targetWindow. The stub keeps ResizeObserver DEFINED on the live
      // window, so the missing-observer path is not what this test
      // exercises: the null window is.
      const element = document.implementation.createHTMLDocument('detached').createElement('div');
      Object.defineProperty(element, 'offsetHeight', { configurable: true, value: 1_080 });

      // attachScroller builds its element from the live document, whose
      // defaultView is the jsdom window, so this subject is attached through
      // the ref directly instead.
      act(() => {
        result.current.scrollRef(element);
      });

      // Same math as the measured-viewport test: 1080 px fits 30 rows and
      // the overscan bands add 5 → 35 rows. The hook measures synchronously
      // BEFORE the guard, so the rail must still mount exactly this window,
      // and the guard must then return WITHOUT touching the null window.
      expect(result.current.visibleItems).toHaveLength(35);
      expect(result.current.visibleItems[0]?.id).toBe('req-0');

      expect(errors).toEqual([]);
    } finally {
      window.removeEventListener('error', onError);
      vi.unstubAllGlobals();
    }
  });
});
