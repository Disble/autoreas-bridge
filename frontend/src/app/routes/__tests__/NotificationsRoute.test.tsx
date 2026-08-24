import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationsRoute } from '../NotificationsRoute';

vi.mock('../../../features/notifications/ui/NotificationCenterPanel/NotificationCenterPanel', () => ({
  NotificationCenterPanel: () => <div>notification center panel</div>,
}));

afterEach(cleanup);

describe('NotificationsRoute', () => {
  it('renders NotificationCenterPanel without throwing', () => {
    render(<NotificationsRoute />);

    expect(screen.getByText('notification center panel')).toBeInTheDocument();
  });

  it('renders the page header matching its nav label', () => {
    render(<NotificationsRoute />);

    expect(screen.getByRole('heading', { level: 1, name: 'Notifications' })).toBeInTheDocument();
  });
});
