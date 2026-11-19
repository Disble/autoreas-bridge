import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationAction, NotificationCenterSource } from '../../../../../shared/contracts/notification-center.types';
import { NotificationDetailFooter } from '../NotificationDetailFooter';
import { notificationsQueryWrapper } from '../../NotificationCenterPanel/__tests__/notification-center.test-support';

afterEach(cleanup);

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
  // The artboard's footer (`Main.dc.html`): `Open Downloads · Archive · Mark unread`.
  it("renders the record's own action, then archive and mark unread as the artboard draws them", () => {
    render(<NotificationDetailFooter actions={[buildAction()]} notificationId={1} source={buildFooterSource()} />, { wrapper: notificationsQueryWrapper().wrapper });

    // The record's own whole-notification action, which the pane used to fetch and drop.
    expect(screen.getByRole('button', { name: 'Open Downloads' })).toBeInTheDocument();
    // Archive beside it, the one lifecycle verb the pane itself can carry out.
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    // Mark unread as the third footer action.
    expect(screen.getByRole('button', { name: 'Mark unread' })).toBeInTheDocument();
  });

  it('executes a pressed whole-notification action against the record it belongs to', async () => {
    const source = buildFooterSource();
    render(<NotificationDetailFooter actions={[buildAction()]} notificationId={42} source={source} />, { wrapper: notificationsQueryWrapper().wrapper });

    screen.getByRole('button', { name: 'Open Downloads' }).click();

    await waitFor(() => {
      expect(source.executeAction).toHaveBeenCalledWith(42, 'act-open');
    });
  });

  it('archives exactly the open record when archive is pressed', async () => {
    const source = buildFooterSource();
    render(<NotificationDetailFooter actions={[buildAction()]} notificationId={42} source={source} />, { wrapper: notificationsQueryWrapper().wrapper });

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
      />, { wrapper: notificationsQueryWrapper().wrapper },
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
    render(<NotificationDetailFooter actions={[]} notificationId={1} source={buildFooterSource()} />, { wrapper: notificationsQueryWrapper().wrapper });

    expect(screen.getByTestId('notification-detail-footer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark unread' })).toBeInTheDocument();
    // Exactly those two: a record with no action of its own must not sprout one.
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  // Archiving stamps read_at_ms as a side effect, so the two verbs move the
  // same axis in opposite directions and must not be wired to each other's
  // binding.
  it('marks only the open record unread on its own binding, never archive', async () => {
    const source = buildFooterSource();
    render(<NotificationDetailFooter actions={[buildAction()]} notificationId={42} source={source} />, { wrapper: notificationsQueryWrapper().wrapper });

    screen.getByRole('button', { name: 'Mark unread' }).click();

    await waitFor(() => {
      expect(source.markUnread).toHaveBeenCalledWith([42]);
    });
    expect(source.markUnread).toHaveBeenCalledTimes(1);
    expect(source.archive).not.toHaveBeenCalled();
  });

  // Firing the mutation is only half the button. The panel re-reads the unread
  // count the rail badge shows when it hears the record went back to unread,
  // so a press that never told it would leave the badge standing while the
  // record went back to unread underneath.
  it('tells the pane the record went back to unread, so the badge count is read again', async () => {
    const onReadStateChanged = vi.fn();
    render(
      <NotificationDetailFooter
        actions={[buildAction()]}
        notificationId={42}
        onReadStateChanged={onReadStateChanged}
        source={buildFooterSource()}
      />,
      { wrapper: notificationsQueryWrapper().wrapper },
    );

    screen.getByRole('button', { name: 'Mark unread' }).click();

    await waitFor(() => {
      expect(onReadStateChanged).toHaveBeenCalledWith([42], false);
    });
  });
});
