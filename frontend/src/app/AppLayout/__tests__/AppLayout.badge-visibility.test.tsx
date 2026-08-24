import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AppLayout } from '../AppLayout';

// Without this the first test's tree stays mounted into the second, which
// then sees two rails and two badges. This file is not configured for
// auto-cleanup; every other suite in the repo calls it explicitly.
afterEach(cleanup);

vi.mock('../../NotificationToasts', () => ({
  NotificationToasts: () => <div data-testid="notification-toasts" />,
}));

// Stubs the badge's own hook rather than the infrastructure source it reaches
// through. The app layer must not import infrastructure -- fallow's
// boundary-violation rule is right to block that, and it applies to a test as
// much as to production code. Mocking here keeps the real badge component and
// the real rail markup in the render, which is what this test is about: WHERE
// the count appears, not what the count is.
vi.mock('../../../features/navigation/NotificationsNavBadge/use-notifications-nav-badge', () => ({
  useNotificationsNavBadge: () => 3,
}));

/**
 * The Tailwind class that hides the rail's text layer until the rail is
 * hovered or focused. Written as a literal rather than imported: the point of
 * this test is that the badge must not sit behind this gate, so reading the
 * gate from the component under test would make the assertion circular.
 */
const RAIL_HOVER_GATE_CLASS = 'opacity-0';

/**
 * Renders the layout with the rail present.
 */
function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/today']}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/today" element={<div>Today outlet</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppLayout unread badge visibility', () => {
  // jsdom applies no Tailwind stylesheet, so computed opacity cannot be read
  // here. The assertion is therefore structural: the count must not be a
  // descendant of the element carrying the hover gate. That is the same fact
  // in a form jsdom can actually check, and it fails today for the real reason
  // -- the badge is nested inside the gated label span (AppLayout.tsx:76-79).
  it('renders the unread count outside the rail label layer that only appears on hover', async () => {
    renderLayout();

    const badge = await screen.findByText('3');
    const gated = badge.closest(`.${RAIL_HOVER_GATE_CLASS}`);

    expect(gated).toBeNull();
  });

  it('still renders the Notifications label inside the hover-gated layer', async () => {
    renderLayout();
    await screen.findByText('3');

    // The label may stay hidden while collapsed -- only the count may not.
    // `getAllByText`, because the mobile bottom nav renders the same word and
    // both landmarks currently share one accessible name (a real duplicate-
    // landmark defect in AppLayout, out of scope here). At least one of them
    // must remain behind the gate: this guards against a "fix" that simply
    // unhides the whole label layer instead of moving the count out of it.
    const labels = screen.getAllByText('Notifications');

    expect(labels.some((label) => label.closest(`.${RAIL_HOVER_GATE_CLASS}`) !== null)).toBe(true);
  });

  // The zero case ("no badge at all, not a rendered 0") is already owned by
  // `NotificationsNavBadge.test.tsx`, which can drive the count directly. It
  // cannot be driven from here, where the source is a static module mock, so
  // repeating it here would only ever assert against a hardcoded 3.
});
