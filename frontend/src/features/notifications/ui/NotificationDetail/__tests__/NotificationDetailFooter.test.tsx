import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource } from '../../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationAction } from '../../../../../shared/contracts/notification-center.types';
import { NotificationDetailFooter } from '../NotificationDetailFooter';

afterEach(cleanup);

/** Minimal action fixture builder, matching `notification-detail.helpers.test.ts`'s own. */
function buildAction(overrides: Partial<NotificationAction> = {}): NotificationAction {
  return { id: 'act-open', intent: 'navigation.open', label: 'Open Downloads', ...overrides };
}

/** Builds a fake `NotificationCenterSource` covering both calls the footer can make, mirroring `use-notification-action.test.ts`'s own fake. */
function buildFooterSource(): NotificationCenterSource {
  return {
    archive: vi.fn().mockResolvedValue({ affected: 1, degraded: false, unreadCount: 0 }),
    executeAction: vi.fn().mockResolvedValue({ executed: true, executedAtMs: 1_700_000_000_000 }),
  } as unknown as NotificationCenterSource;
}

describe('NotificationDetailFooter', () => {
  it("renders the record's own whole-notification action, which the pane used to fetch and drop", () => {
    render(<NotificationDetailFooter actions={[buildAction()]} notificationId={1} source={buildFooterSource()} />);

    expect(screen.getByRole('button', { name: 'Open Downloads' })).toBeInTheDocument();
  });

  it('renders archive beside it, the one lifecycle verb the pane itself can carry out', () => {
    render(<NotificationDetailFooter actions={[buildAction()]} notificationId={1} source={buildFooterSource()} />);

    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });

  it('executes a pressed whole-notification action against the record it belongs to', async () => {
    const source = buildFooterSource();
    render(<NotificationDetailFooter actions={[buildAction()]} notificationId={42} source={source} />);

    screen.getByRole('button', { name: 'Open Downloads' }).click();

    await waitFor(() => {
      expect(source.executeAction).toHaveBeenCalledWith(42, 'act-open');
    });
  });

  it('archives exactly the open record when archive is pressed', async () => {
    const source = buildFooterSource();
    render(<NotificationDetailFooter actions={[buildAction()]} notificationId={42} source={source} />);

    screen.getByRole('button', { name: 'Archive' }).click();

    await waitFor(() => {
      expect(source.archive).toHaveBeenCalledWith([42]);
    });
  });

  it('renders every whole-notification action, never truncating to the first', () => {
    render(
      <NotificationDetailFooter
        actions={[buildAction(), buildAction({ id: 'act-settings', label: 'Open Settings' })]}
        notificationId={1}
        source={buildFooterSource()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Open Downloads' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Settings' })).toBeInTheDocument();
  });

  // The whole footer disappears, archive included: a record with nothing to do
  // must not grow an empty toolbar, and archiving stays reachable from the
  // list's own selection bar.
  it('renders no footer at all for a record carrying no whole-notification action', () => {
    render(<NotificationDetailFooter actions={[]} notificationId={1} source={buildFooterSource()} />);

    expect(screen.queryByTestId('notification-detail-footer')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
