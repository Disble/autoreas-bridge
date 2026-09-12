import { renderHook } from '@testing-library/react';
import { createElement, StrictMode } from 'react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardDispatcher } from '../use-keyboard-dispatcher';

/**
 * Wraps the hook in the router context `useNavigate` requires. Built with
 * `createElement` rather than JSX, since this suite is a `.ts` file (not
 * `.tsx`) to match the file the task list names.
 */
function routerWrapper({ children }: Readonly<{ children: ReactNode }>) {
  return createElement(MemoryRouter, null, children);
}

/** The same router wrapper, mounted inside `React.StrictMode`, to prove the listener survives its double-invocation (R-5). */
function strictRouterWrapper({ children }: Readonly<{ children: ReactNode }>) {
  return createElement(StrictMode, null, createElement(MemoryRouter, null, children));
}

/** Narrows a spy's recorded calls to the ones naming the given event type, ignoring every other listener React or jsdom itself may bind. */
function callsForEventType(spy: ReturnType<typeof vi.spyOn>, eventType: string): unknown[][] {
  return spy.mock.calls.filter(([type]: readonly unknown[]) => type === eventType);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useKeyboardDispatcher', () => {
  it('binds exactly one keydown listener on window', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');

    renderHook(() => useKeyboardDispatcher(), { wrapper: routerWrapper });

    expect(callsForEventType(addSpy, 'keydown')).toHaveLength(1);
  });

  it('removes the listener on unmount with the exact reference it was added with', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useKeyboardDispatcher(), { wrapper: routerWrapper });
    const [, addedHandler] = callsForEventType(addSpy, 'keydown')[0] ?? [];

    unmount();

    const [, removedHandler] = callsForEventType(removeSpy, 'keydown')[0] ?? [];
    expect(removedHandler).toBe(addedHandler);
  });

  it('survives React.StrictMode double-invocation without leaking a second listener', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    renderHook(() => useKeyboardDispatcher(), { wrapper: strictRouterWrapper });

    const netKeydownListeners = callsForEventType(addSpy, 'keydown').length - callsForEventType(removeSpy, 'keydown').length;
    expect(netKeydownListeners).toBe(1);
  });
});
