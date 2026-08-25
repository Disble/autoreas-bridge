import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';

/**
 * Renders the run-history panel at a route, which is how the app runs it.
 *
 * The panel reads the run a caller asked for out of the query string, so it
 * needs a router the way it needs the store: not as test scaffolding, but
 * because a notification's "See this run" verb is a route change and the panel
 * has to answer one. Every render in these suites goes through here rather than
 * only the tests that care, so a suite can never accidentally exercise the
 * panel in a shape the application never mounts.
 *
 * @param search Query string the panel should see, e.g. `?runId=run-7`.
 * @returns A wrapper component for `render`/`renderHook`.
 */
export function atRoute(search = '') {
  return function RouteWrapper({ children }: Readonly<{ readonly children?: ReactNode }>) {
    return <MemoryRouter initialEntries={[`/downloads${search}`]}>{children}</MemoryRouter>;
  };
}
