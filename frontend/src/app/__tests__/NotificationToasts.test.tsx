import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const useNotificationToastsMock = vi.fn();

vi.mock('../../hooks/use-notification-toasts', () => ({
  useNotificationToasts: useNotificationToastsMock,
}));

vi.mock('@heroui/react', () => ({
  ToastProvider: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="toast-provider">{children}</div>
  ),
}));

describe('NotificationToasts', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('mounts the HeroUI toast provider', async () => {
    const { NotificationToasts } = await import('../NotificationToasts');
    render(<NotificationToasts />);

    expect(screen.getByTestId('toast-provider')).toBeInTheDocument();
  });

  it('subscribes to notification.push via useNotificationToasts', async () => {
    const { NotificationToasts } = await import('../NotificationToasts');
    render(<NotificationToasts />);

    expect(useNotificationToastsMock).toHaveBeenCalledTimes(1);
  });
});
