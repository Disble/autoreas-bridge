import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationSource } from '../../../../../infrastructure/notification-source/notification-source.types';
import { NotificationNavigationListener } from '../NotificationNavigationListener';

afterEach(cleanup);

/**
 * A `NotificationSource` stub whose navigate stream a test drives by hand,
 * standing in for the Go `notification.navigate` runtime event.
 * @returns The stub source, the hand-crank, and a live subscriber count.
 */
function makeNavigateBus(): {
  readonly emitNavigate: (route: string) => void;
  readonly listenerCount: () => number;
  readonly source: NotificationSource;
} {
  const listeners = new Set<(route: string) => void>();

  return {
    emitNavigate(route: string) {
      for (const listener of listeners) {
        listener(route);
      }
    },
    listenerCount: () => listeners.size,
    source: {
      subscribe: () => () => undefined,
      subscribeArchived: () => () => undefined,
      subscribeNavigate(listener: (route: string) => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
  };
}

/** Renders the live router location so an assertion reads where the app IS, not which function ran. */
function LocationProbe() {
  const location = useLocation();

  return <span data-testid="landed-on">{location.pathname}</span>;
}

/**
 * Builds the routed tree the listener is mounted in, beside a routed outlet
 * exactly as `AppLayout` mounts it.
 * @param source The navigate stream the listener subscribes to.
 * @returns The element tree to render.
 */
function buildTree(source: NotificationSource) {
  return (
    <MemoryRouter initialEntries={['/notifications']}>
      <NotificationNavigationListener source={source} />
      <LocationProbe />
      <Routes>
        <Route element={<span>Notifications screen</span>} path="/notifications" />
        <Route element={<span>Downloads screen</span>} path="/downloads" />
        <Route element={<span>Editor screen</span>} path="/editor/:id" />
      </Routes>
    </MemoryRouter>
  );
}

/**
 * Mounts the listener behind a real router at `/notifications`.
 * @param source The navigate stream the listener subscribes to.
 * @returns The Testing Library render result, so a test can unmount or re-render.
 */
function renderListener(source: NotificationSource) {
  return render(buildTree(source));
}

describe('NotificationNavigationListener', () => {
  it('moves the application to the route the event carries', () => {
    const bus = makeNavigateBus();
    renderListener(bus.source);

    act(() => {
      bus.emitNavigate('/downloads');
    });

    expect(screen.getByTestId('landed-on')).toHaveTextContent('/downloads');
    expect(screen.getByText('Downloads screen')).toBeInTheDocument();
  });

  it('follows whatever route the event carries, not one route it knows about', () => {
    // `service_readiness_attention.go` freezes `/editor/<animeId>` into its own
    // navigation tokens, so a listener hardcoded to the Downloads screen would
    // pass the headline case and silently strand every other producer.
    const bus = makeNavigateBus();
    renderListener(bus.source);

    act(() => {
      bus.emitNavigate('/editor/a-4417');
    });

    expect(screen.getByTestId('landed-on')).toHaveTextContent('/editor/a-4417');
    expect(screen.getByText('Editor screen')).toBeInTheDocument();
  });

  it('stays put until an event actually arrives', () => {
    const bus = makeNavigateBus();
    renderListener(bus.source);

    expect(screen.getByTestId('landed-on')).toHaveTextContent('/notifications');
  });

  it('navigates on a second event, so an idempotent intent stays usable', () => {
    const bus = makeNavigateBus();
    renderListener(bus.source);

    act(() => {
      bus.emitNavigate('/downloads');
    });
    act(() => {
      bus.emitNavigate('/editor/a-4417');
    });
    act(() => {
      bus.emitNavigate('/downloads');
    });

    expect(screen.getByTestId('landed-on')).toHaveTextContent('/downloads');
  });

  it('releases its runtime subscription when it unmounts', () => {
    const bus = makeNavigateBus();
    const { unmount } = renderListener(bus.source);

    expect(bus.listenerCount()).toBe(1);

    unmount();

    expect(bus.listenerCount()).toBe(0);
  });

  it('subscribes exactly once across re-renders, never re-subscribing per render', () => {
    const subscribeNavigate = vi.fn().mockReturnValue(() => undefined);
    const source: NotificationSource = {
      subscribe: () => () => undefined,
      subscribeArchived: () => () => undefined,
      subscribeNavigate,
    };

    const { rerender } = renderListener(source);
    rerender(buildTree(source));
    rerender(buildTree(source));

    expect(subscribeNavigate).toHaveBeenCalledTimes(1);
  });
});
