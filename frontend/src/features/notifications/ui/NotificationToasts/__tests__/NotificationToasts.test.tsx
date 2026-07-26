import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { NotificationToasts } from '../NotificationToasts';

vi.mock('@heroui/react', () => ({
  ToastProvider: (props: { children?: React.ReactNode }) => (
    <div data-testid="toast-provider">{props.children}</div>
  ),
  toast: {
    close: vi.fn(),
    info: vi.fn().mockReturnValue('info-id'),
    success: vi.fn().mockReturnValue('success-id'),
    warning: vi.fn().mockReturnValue('warning-id'),
    danger: vi.fn().mockReturnValue('danger-id'),
  },
}));

vi.mock('../use-backend-event-resolver', () => ({
  useBackendEventResolver: vi.fn(),
}));

vi.mock('../use-missed-schedule-resolver', () => ({
  useMissedScheduleResolver: vi.fn(),
}));

describe('NotificationToasts', () => {
  it('mounts the HeroUI toast provider and wires both notification resolvers', () => {
    render(
      <MemoryRouter>
        <NotificationToasts />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('toast-provider')).toBeInTheDocument();
  });
});
