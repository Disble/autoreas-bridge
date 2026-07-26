import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

vi.mock('../../features/notifications/ui/NotificationToasts/use-backend-event-resolver', () => ({
  useBackendEventResolver: vi.fn(),
}));

vi.mock('../../features/notifications/ui/NotificationToasts/use-missed-schedule-resolver', () => ({
  useMissedScheduleResolver: vi.fn(),
}));

vi.mock('@heroui/react', () => ({
  ToastProvider: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="toast-provider">{children}</div>
  ),
  toast: {
    close: vi.fn(),
    info: vi.fn().mockReturnValue('info-id'),
    success: vi.fn().mockReturnValue('success-id'),
    warning: vi.fn().mockReturnValue('warning-id'),
    danger: vi.fn().mockReturnValue('danger-id'),
  },
}));

describe('NotificationToasts', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('mounts the HeroUI toast provider', async () => {
    const { NotificationToasts } = await import('../NotificationToasts');
    render(
      <MemoryRouter>
        <NotificationToasts />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('toast-provider')).toBeInTheDocument();
  });
});
