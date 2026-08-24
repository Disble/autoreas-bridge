import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationsRoute } from '../NotificationsRoute';

vi.mock('../../../features/notifications/ui/NotificationCenterPanel/NotificationCenterPanel', () => ({
  NotificationCenterPanel: () => <div>notification center panel</div>,
}));

afterEach(cleanup);

// The "page header equals nav label" assertion that used to live here moved
// with the header itself: it is now rendered by the panel, because "Mark all
// as read" acts on the rows the master list holds. It is pinned by
// `NotificationCenterHeader.test.tsx` and, at the seam, by
// `NotificationCenterPanel.chrome.integration.test.tsx`.
describe('NotificationsRoute', () => {
  it('renders NotificationCenterPanel without throwing', () => {
    render(<NotificationsRoute />);

    expect(screen.getByText('notification center panel')).toBeInTheDocument();
  });
});
