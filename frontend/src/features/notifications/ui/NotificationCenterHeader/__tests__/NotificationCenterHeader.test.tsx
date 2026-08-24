import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationCenterHeader } from '../NotificationCenterHeader';

afterEach(cleanup);

describe('NotificationCenterHeader', () => {
  it('renders the page heading', () => {
    render(<NotificationCenterHeader canMarkAllRead onMarkAllRead={vi.fn()} unreadCount={0} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Notifications' })).toBeInTheDocument();
  });

  it('carries the live unread count in the subtitle', () => {
    render(<NotificationCenterHeader canMarkAllRead onMarkAllRead={vi.fn()} unreadCount={12} />);

    expect(screen.getByText('12 unread · Warnings and failures stay here after the toast disappears.')).toBeInTheDocument();
  });

  it('reports a press on "Mark all as read"', () => {
    const onMarkAllRead = vi.fn();
    render(<NotificationCenterHeader canMarkAllRead onMarkAllRead={onMarkAllRead} unreadCount={4} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));

    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it('disables "Mark all as read" when the list holds nothing unread to mark', () => {
    render(<NotificationCenterHeader canMarkAllRead={false} onMarkAllRead={vi.fn()} unreadCount={0} />);

    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDisabled();
  });
});
