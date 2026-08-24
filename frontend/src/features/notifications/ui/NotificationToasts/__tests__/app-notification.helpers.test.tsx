import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppNotification } from '../../../../../shared/contracts/app-notification.types';

vi.mock('../app-toast-queue', () => ({
  appToastQueue: { add: vi.fn().mockReturnValue('toast-id') },
  resolveToastTimeoutMs: vi.fn((persistent: boolean | undefined) => (persistent ? 0 : 4000)),
}));

vi.mock('@heroui/react', () => ({
  Toast: ({ children }: { readonly children?: ReactNode }) => <div data-testid="toast">{children}</div>,
  ToastContent: ({ children }: { readonly children?: ReactNode }) => <div>{children}</div>,
  ToastTitle: ({ children }: { readonly children?: ReactNode }) => <div>{children}</div>,
  ToastDescription: ({ children }: { readonly children?: ReactNode }) => <div>{children}</div>,
  ToastActionButton: ({ children, onPress }: { readonly children?: ReactNode; readonly onPress?: () => void }) => (
    <button type="button" onClick={onPress}>
      {children}
    </button>
  ),
  ToastCloseButton: () => <button type="button" aria-label="Close" />,
}));

import { renderAppNotificationToast, renderAppToastContent } from '../app-notification.helpers';
import { appToastQueue } from '../app-toast-queue';

describe('renderAppNotificationToast', () => {
  it('adds the notification to the app-owned queue carrying every action, not just the first', () => {
    const notification: AppNotification = {
      severity: 'warning',
      title: 'Missed selected day',
      actions: [
        { label: 'Run now', onPress: vi.fn() },
        { label: 'Ignore', onPress: vi.fn() },
      ],
      persistent: true,
    };

    renderAppNotificationToast(notification);

    expect(vi.mocked(appToastQueue.add)).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Missed selected day',
        variant: 'warning',
        actions: notification.actions,
      }),
      { timeout: 0 },
    );
  });
});

/**
 * Bug B guard: `renderAppToastContent` must render every action, not just
 * the first. `use-missed-schedule-resolver.ts` pushes exactly two actions
 * per notice -- a renderer truncating to one silently drops the second.
 */
describe('renderAppToastContent (Bug B guard)', () => {
  it('renders a single-action notification normally', () => {
    render(
      renderAppToastContent({
        toast: { key: 'solo', content: { title: 'Solo', actions: [{ label: 'Open', onPress: vi.fn() }] } },
      }),
    );

    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
  });

  it('renders BOTH actions of a two-action toast -- FAILS if the second action becomes unreachable', () => {
    const secondOnPress = vi.fn();
    render(
      renderAppToastContent({
        toast: {
          key: 'two-action',
          content: {
            title: 'Missed selected day',
            actions: [
              { label: 'Run now', onPress: vi.fn() },
              { label: 'Ignore', onPress: secondOnPress },
            ],
          },
        },
      }),
    );

    expect(screen.getByRole('button', { name: 'Run now' })).toBeInTheDocument();
    const secondAction = screen.getByRole('button', { name: 'Ignore' });
    expect(secondAction).toBeInTheDocument();
  });
});
