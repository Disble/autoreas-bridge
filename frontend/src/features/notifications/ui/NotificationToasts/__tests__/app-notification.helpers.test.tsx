import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

afterEach(cleanup);

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

  it('forwards the notification recordId onto the queued payload, so "View details" can resolve it', () => {
    const notification: AppNotification = { severity: 'info', title: 'Run completed', recordId: 42 };

    renderAppNotificationToast(notification);

    expect(vi.mocked(appToastQueue.add)).toHaveBeenCalledWith(expect.objectContaining({ recordId: 42 }), expect.anything());
  });
});

/**
 * Task-Planning Note C / notifications delta spec, "The persistedId enables
 * opening the matching Center record": a toast carrying a non-empty
 * `recordId` renders a "View details" action that navigates there.
 */
describe('renderAppToastContent — "View details" affordance', () => {
  it('renders a "View details" action for a toast carrying a non-empty recordId', () => {
    render(renderAppToastContent({ toast: { key: 'r1', content: { title: 'Run completed', recordId: 42 } } }));

    expect(screen.getByRole('button', { name: 'View details' })).toBeInTheDocument();
  });

  it('navigates to the Center record scoped by that recordId when the affordance is pressed', () => {
    window.location.hash = '';
    render(renderAppToastContent({ toast: { key: 'r1', content: { title: 'Run completed', recordId: 42 } } }));

    screen.getByRole('button', { name: 'View details' }).click();

    expect(window.location.hash).toBe('#/notifications?recordId=42');
  });

  it('renders no "View details" action for a toast carrying no recordId', () => {
    render(renderAppToastContent({ toast: { key: 'r2', content: { title: 'No record' } } }));

    expect(screen.queryByRole('button', { name: 'View details' })).not.toBeInTheDocument();
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

describe('renderAppToastContent rows', () => {
  it('names what the toast is about when the notification carries rows', () => {
    renderToast({
      title: 'Download run completed',
      rows: [{ refType: 'anime', refId: 'a-1', name: 'Frieren', status: 'downloaded', detail: 'Episode 19' }],
    });

    expect(screen.getByTestId('notification-toast-rows')).toBeInTheDocument();
    expect(screen.getByText('Frieren')).toBeInTheDocument();
  });

  // An empty block is worse than none: it reserves space in a card measured in pixels for a list
  // with nothing in it.
  it('renders no row block at all when the notification names nothing', () => {
    renderToast({ title: 'Download run started' });

    expect(screen.queryByTestId('notification-toast-rows')).not.toBeInTheDocument();
  });

  it('renders no row block for an empty row list either', () => {
    renderToast({ title: 'Download run started', rows: [] });

    expect(screen.queryByTestId('notification-toast-rows')).not.toBeInTheDocument();
  });
});

/** Renders one queued toast's content from a partial payload. */
function renderToast(content: Record<string, unknown>): void {
  render(renderAppToastContent({ toast: { content, key: 'k' } as never }));
}
