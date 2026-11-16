import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { createDownloadsWrapper } from '../../../../../shared/hooks/use-missed-schedule-notice/__tests__/downloads.test-support';

/** The downloads wrapper of the latest `atRoute` call, which `emitRunEvent` fires through. */
let latestDownloads: ReturnType<typeof createDownloadsWrapper> | undefined;

/**
 * Renders the run-history panel at a route, which is how the app runs it, under
 * a query client whose downloads module is ready.
 *
 * The panel reads the run a caller asked for out of the query string, so it
 * needs a router the way it needs the query client: not as test scaffolding, but
 * because a notification's "See this run" verb is a route change and the panel
 * has to answer one. Every render in these suites goes through here rather than
 * only the tests that care, so a suite can never accidentally exercise the
 * panel in a shape the application never mounts.
 *
 * @param search Query string the panel should see, e.g. `?runId=run-7`.
 * @returns A wrapper component for `render`/`renderHook`.
 */
export function atRoute(search = '') {
  const downloads = createDownloadsWrapper();
  latestDownloads = downloads;
  const DownloadsWrapper = downloads.wrapper;

  return function RouteWrapper({ children }: Readonly<{ readonly children?: ReactNode }>) {
    return (
      <DownloadsWrapper>
        <MemoryRouter initialEntries={[`/downloads${search}`]}>{children}</MemoryRouter>
      </DownloadsWrapper>
    );
  };
}

/** Fires one download run event through the app's invalidation rules for the latest render. */
export function emitRunEvent() {
  latestDownloads?.emitEvent('download.run_finished');
}
