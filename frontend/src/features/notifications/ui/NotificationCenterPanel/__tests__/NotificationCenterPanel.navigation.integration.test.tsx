import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource } from '../../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationSource } from '../../../../../infrastructure/notification-source/notification-source.types';
import type { NotificationAction, NotificationDetail, NotificationPage } from '../../../../../shared/contracts/notification-center.types';
import { resetNotificationStore } from '../../../../../shared/store/notification-store/notification-store.helpers';
import { NotificationNavigationListener } from '../../NotificationNavigationListener/NotificationNavigationListener';
import { NotificationCenterPanel } from '../NotificationCenterPanel';

afterEach(cleanup);
beforeEach(resetNotificationStore);

/** The one row the master list returns, whose record carries the whole-notification "Open Downloads" token. */
const LISTED_PAGE: NotificationPage = {
  items: [{ id: 7, createdAtMs: 1000, title: 'Download run finished', body: 'Two of three animes completed', level: 'warning', source: 'download', actionCount: 1 }],
  appliedLimit: 25,
  totalEver: 1,
  degraded: false,
};

/**
 * Builds the record `getNotification(7)` resolves to. `action` is supplied by
 * each test so it can model the token BEFORE any press (fresh) and AFTER one
 * (executed-stamped), which is exactly what distinguishes a repeatable button
 * from a spent one on a second visit.
 * @param action The whole-notification action token the record carries.
 * @returns The detail record the stub source serves.
 */
function buildRecord(action: NotificationAction): NotificationDetail {
  return {
    id: 7,
    createdAtMs: 1000,
    title: 'Download run finished',
    body: 'Two of three animes completed',
    level: 'warning',
    source: 'download',
    actionCount: 1,
    rows: [],
    actions: [action],
  };
}

/** The fresh, never-pressed "Open Downloads" token the backend freezes with a `/downloads` route. */
const FRESH_OPEN_ACTION: NotificationAction = { id: 'act-open', label: 'Open Downloads', intent: 'navigation.open', repeatable: true };

/**
 * A `NotificationSource` stub whose navigate stream a test drives by hand.
 *
 * It stands in for the Go runtime event: `navigationOpenIntent` emits
 * `notification.navigate` carrying the frozen route, and nothing else about
 * the press reaches the frontend. Driving it from inside `executeAction`
 * below reproduces the real ordering — the event is emitted while the handler
 * runs, before the press result returns.
 * @returns The stub source plus the hand-crank that emits a route on it.
 */
function makeNavigateBus(): { readonly emitNavigate: (route: string) => void; readonly source: NotificationSource } {
  const listeners = new Set<(route: string) => void>();

  return {
    emitNavigate(route: string) {
      for (const listener of listeners) {
        listener(route);
      }
    },
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

/**
 * Builds a notification-center source whose list and detail reads are wired
 * for real, with `executeAction` supplied per test.
 * @param overrides Methods to replace on the returned source.
 * @returns A `NotificationCenterSource` double.
 */
function makeSource(overrides: Partial<NotificationCenterSource> = {}): NotificationCenterSource {
  return {
    listNotifications: vi.fn().mockResolvedValue(LISTED_PAGE),
    getNotification: vi.fn().mockResolvedValue({ found: true, item: buildRecord(FRESH_OPEN_ACTION), degraded: false }),
    getUnreadCount: vi.fn().mockResolvedValue(1),
    markRead: vi.fn().mockResolvedValue({ affected: 1, unreadCount: 0, degraded: false }),
    markUnread: vi.fn().mockResolvedValue({ affected: 1, unreadCount: 1, degraded: false }),
    archive: vi.fn(),
    restore: vi.fn(),
    executeAction: vi.fn().mockResolvedValue({ executed: true }),
    ...overrides,
  };
}

/** Renders the live router location, so an assertion can read where the application actually IS rather than which function ran. */
function LocationProbe() {
  const location = useLocation();

  return <span data-testid="landed-on">{location.pathname}</span>;
}

/** Stands in for the real Downloads screen, and offers the way back the second-press case needs. */
function DownloadsScreenStub() {
  const navigate = useNavigate();

  return (
    <div>
      <h1>Downloads screen</h1>
      <button
        onClick={() => {
          void navigate('/notifications');
        }}
        type="button"
      >
        Back to notifications
      </button>
    </div>
  );
}

/**
 * Mounts the notification screen and a Downloads screen behind a real router,
 * with the navigation listener alongside them exactly as `AppLayout` mounts
 * it beside the routed outlet.
 * @param source The notification-center source the panel reads and presses against.
 * @param navigateSource The runtime navigate stream the listener subscribes to.
 */
function renderRoutedApp(source: NotificationCenterSource, navigateSource: NotificationSource): void {
  render(
    <MemoryRouter initialEntries={['/notifications']}>
      <NotificationNavigationListener source={navigateSource} />
      <LocationProbe />
      <Routes>
        <Route element={<NotificationCenterPanel source={source} />} path="/notifications" />
        <Route element={<DownloadsScreenStub />} path="/downloads" />
      </Routes>
    </MemoryRouter>,
  );
}

/** Opens the seeded record in the detail pane by pressing its master-list row. */
async function openListedRecord(): Promise<void> {
  fireEvent.click(await screen.findByText('Download run finished'));
}

describe('NotificationCenterPanel -> navigation.open (integration)', () => {
  it('lands the application on the Downloads route when "Open Downloads" is pressed', async () => {
    const bus = makeNavigateBus();
    const source = makeSource({
      executeAction: vi.fn().mockImplementation(async () => {
        // The Go handler emits the frozen route and THEN answers the press.
        bus.emitNavigate('/downloads');
        return { executed: true };
      }),
    });

    renderRoutedApp(source, bus.source);
    await openListedRecord();

    fireEvent.click(await screen.findByRole('button', { name: 'Open Downloads' }));

    // The landed location, not the call: `executeAction` was already being
    // called before this fix and the app still never moved, so asserting the
    // call would have passed against the exact bug. Both halves are literals
    // -- reading the route constant would pin nothing.
    await waitFor(() => expect(screen.getByTestId('landed-on')).toHaveTextContent('/downloads'));
    expect(screen.getByRole('heading', { name: 'Downloads screen' })).toBeInTheDocument();
  });

  it('navigates nowhere when the pressed token has no route to open', async () => {
    const bus = makeNavigateBus();
    // A route-less token refuses with target_missing and emits nothing
    // (app_notification_center.go's navigationOpenIntent), so the bus stays silent.
    const source = makeSource({ executeAction: vi.fn().mockResolvedValue({ executed: false, reason: 'target_missing' }) });

    renderRoutedApp(source, bus.source);
    await openListedRecord();

    fireEvent.click(await screen.findByRole('button', { name: 'Open Downloads' }));

    await waitFor(() => expect(screen.getByText('The thing this action pointed at is gone.')).toBeInTheDocument());
    expect(screen.getByTestId('landed-on')).toHaveTextContent('/notifications');
    expect(screen.queryByRole('heading', { name: 'Downloads screen' })).not.toBeInTheDocument();
  });

  it('navigates again on a second press, after the first one already stamped the token executed', async () => {
    const bus = makeNavigateBus();
    const executeAction = vi.fn().mockImplementation(async () => {
      bus.emitNavigate('/downloads');
      return { executed: true, executedAtMs: 1_700_000_000_000 };
    });
    // Returning to the record re-reads it, and the backend has stamped the
    // press by then. `repeatable` is what keeps the button alive across that
    // round trip: `center.Executor` stamps executedAtMs for repeatable and
    // single-fire presses alike, so without it the pane grays the button out
    // and the second press never leaves the frontend.
    const source = makeSource({
      executeAction,
      getNotification: vi
        .fn()
        .mockResolvedValueOnce({ found: true, item: buildRecord(FRESH_OPEN_ACTION), degraded: false })
        .mockResolvedValue({ found: true, item: buildRecord({ ...FRESH_OPEN_ACTION, executedAtMs: 1_700_000_000_000 }), degraded: false }),
    });

    renderRoutedApp(source, bus.source);
    await openListedRecord();
    fireEvent.click(await screen.findByRole('button', { name: 'Open Downloads' }));
    await waitFor(() => expect(screen.getByTestId('landed-on')).toHaveTextContent('/downloads'));

    fireEvent.click(screen.getByRole('button', { name: 'Back to notifications' }));
    await openListedRecord();
    fireEvent.click(await screen.findByRole('button', { name: 'Open Downloads' }));

    await waitFor(() => expect(screen.getByTestId('landed-on')).toHaveTextContent('/downloads'));
    expect(executeAction).toHaveBeenCalledTimes(2);
  });
});
