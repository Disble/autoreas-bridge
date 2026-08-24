import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { NotificationToasts } from '../NotificationToasts';
import { appToastQueue } from '../app-toast-queue';
import { useBackendEventResolver } from '../use-backend-event-resolver';
import { useMissedScheduleResolver } from '../use-missed-schedule-resolver';
import type { AppNotification } from '../../../../../shared/contracts/app-notification.types';

vi.mock('../use-backend-event-resolver', () => ({
  useBackendEventResolver: vi.fn(),
}));

vi.mock('../use-missed-schedule-resolver', () => ({
  useMissedScheduleResolver: vi.fn(),
}));

/**
 * Reads the `push` callback `NotificationToasts` wired into
 * `useBackendEventResolver` (mocked above), so a test can push a notification
 * directly through the REAL `useAppToastController` + `appToastQueue` +
 * `renderAppToastContent` pipeline without mocking `@heroui/react` itself.
 */
function capturePush(): (notification: AppNotification) => void {
  const call = vi.mocked(useBackendEventResolver).mock.calls.at(-1);
  const push = call?.[0];
  if (!push) {
    throw new Error('useBackendEventResolver was not called with a push callback');
  }
  return push;
}

describe('NotificationToasts', () => {
  afterEach(() => {
    cleanup();
    appToastQueue.clear();
    vi.clearAllMocks();
  });

  it('mounts the HeroUI toast provider backed by the app-owned queue and wires both resolvers', () => {
    // HeroUI's ToastRegion portals nothing into the DOM while the queue is
    // empty (react-aria-components' Toast.js: `visibleToasts.length > 0 &&
    // portalContainer ? createPortal(...) : null`) -- with zero toasts
    // pushed there is deliberately no toast-region node to assert on, so
    // this test only pins that mounting doesn't throw and wires both
    // resolver hooks with a push/remove pair.
    render(
      <MemoryRouter>
        <NotificationToasts />
      </MemoryRouter>,
    );

    expect(useBackendEventResolver).toHaveBeenCalledWith(expect.any(Function), expect.any(Function));
    expect(useMissedScheduleResolver).toHaveBeenCalledWith(expect.any(Function), expect.any(Function));
  });

  it(
    'renders every action of a two-action toast, and a later toast never evicts an ' +
      "earlier one's actions (Bug B regression, through the actual mounted ToastProvider)",
    () => {
      render(
        <MemoryRouter>
          <NotificationToasts />
        </MemoryRouter>,
      );
      const push = capturePush();

      act(() => {
        push({
          severity: 'warning',
          title: 'Missed selected day',
          actions: [
            { label: 'Run now', onPress: vi.fn() },
            { label: 'Ignore', onPress: vi.fn() },
          ],
        });
      });

      expect(screen.getByRole('button', { name: 'Run now' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ignore' })).toBeInTheDocument();

      act(() => {
        push({
          severity: 'info',
          title: 'Second toast',
          actions: [{ label: 'Open Downloads', onPress: vi.fn() }],
        });
      });

      expect(screen.getByRole('button', { name: 'Run now' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ignore' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open Downloads' })).toBeInTheDocument();
    },
  );
});
