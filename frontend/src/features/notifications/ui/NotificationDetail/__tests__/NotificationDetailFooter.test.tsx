import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource } from '../../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationAction } from '../../../../../shared/contracts/notification-center.types';
import { getNotificationStoreState, resetNotificationStore } from '../../../../../shared/store/notification-store/notification-store.helpers';
import { NotificationDetailFooter } from '../NotificationDetailFooter';

afterEach(cleanup);
beforeEach(resetNotificationStore);

/** Minimal action fixture builder, matching `notification-detail.helpers.test.ts`'s own. */
function buildAction(overrides: Partial<NotificationAction> = {}): NotificationAction {
  return { id: 'act-open', intent: 'navigation.open', label: 'Open Downloads', ...overrides };
}

/** Builds a fake `NotificationCenterSource` covering both calls the footer can make, mirroring `use-notification-action.test.ts`'s own fake. */
function buildFooterSource(): NotificationCenterSource {
  return {
    archive: vi.fn().mockResolvedValue({ affected: 1, degraded: false, unreadCount: 0 }),
    markUnread: vi.fn().mockResolvedValue({ affected: 1, degraded: false, unreadCount: 2 }),
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

  // This test used to assert the opposite -- no footer at all for a record
  // carrying no whole-notification action -- and its premise ("a record with
  // nothing to do must not grow an empty toolbar") stopped being true when
  // `Mark unread` arrived. Archive and mark-unread apply to EVERY record, so
  // the toolbar is never empty; and mark-unread has no second surface, unlike
  // archive, which the selection bar also offers. Under the old rule the
  // reversible read axis would have been unreachable for every `season`,
  // `sync` and `device` notification, none of which carry an action of their
  // own. Changed deliberately under Slice L rule 3, not to go green.
  it('still offers both lifecycle verbs for a record carrying no whole-notification action', () => {
    render(<NotificationDetailFooter actions={[]} notificationId={1} source={buildFooterSource()} />);

    expect(screen.getByTestId('notification-detail-footer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark unread' })).toBeInTheDocument();
    // Exactly those two: a record with no action of its own must not sprout one.
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  // The artboard's third footer button (`Main.dc.html`): `Open Downloads ·
  // Archive · Mark unread`.
  it('renders mark unread as the third footer action the artboard draws', () => {
    render(<NotificationDetailFooter actions={[buildAction()]} notificationId={1} source={buildFooterSource()} />);

    expect(screen.getByRole('button', { name: 'Mark unread' })).toBeInTheDocument();
  });

  it('marks exactly the open record unread when mark unread is pressed', async () => {
    const source = buildFooterSource();
    render(<NotificationDetailFooter actions={[buildAction()]} notificationId={42} source={source} />);

    screen.getByRole('button', { name: 'Mark unread' }).click();

    await waitFor(() => {
      expect(source.markUnread).toHaveBeenCalledWith([42]);
    });
  });

  // Firing the mutation is only half the button. The rail badge reads the
  // shared store, so a press that never fed it would leave the badge standing
  // at whatever it was while the record went back to unread underneath.
  it('raises the shared unread count the rail badge reads', async () => {
    render(<NotificationDetailFooter actions={[buildAction()]} notificationId={42} source={buildFooterSource()} />);

    screen.getByRole('button', { name: 'Mark unread' }).click();

    await waitFor(() => {
      expect(getNotificationStoreState().unreadCount).toBe(2);
    });
  });

  // Archiving stamps read_at_ms as a side effect, so the two verbs move the
  // same axis in opposite directions and must not be wired to each other's
  // binding.
  it('keeps mark unread and archive on separate bindings', async () => {
    const source = buildFooterSource();
    render(<NotificationDetailFooter actions={[buildAction()]} notificationId={42} source={source} />);

    screen.getByRole('button', { name: 'Mark unread' }).click();

    await waitFor(() => {
      expect(source.markUnread).toHaveBeenCalledTimes(1);
    });
    expect(source.archive).not.toHaveBeenCalled();
  });
});
