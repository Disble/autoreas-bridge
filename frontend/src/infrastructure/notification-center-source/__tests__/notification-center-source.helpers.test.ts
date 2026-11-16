import { describe, expect, it, vi } from 'vitest';

import type { NotificationCenterSource } from '../../../shared/contracts/notification-center.types';
import { useIsolatedWailsRuntime } from '../../__tests__/bridge-runtime-source.test-support';

/** One page as `ListNotifications` answers it. */
const PAGE = {
  items: [{ id: 1, createdAtMs: 1000, title: 'Episode ready', body: '', level: 'info', source: 'download', actionCount: 0 }],
  appliedLimit: 25,
  totalEver: 1,
  degraded: false,
};

/** One record as `GetNotification` answers it. */
const DETAIL = { found: true, item: { ...PAGE.items[0], rows: [], actions: [] }, degraded: false };

/** One mutation envelope as the four lifecycle bindings answer it. */
const MUTATION = { affected: 2, unreadCount: 3, degraded: false };

/** Every notification-center binding, as `window.go.desktop.App` exposes it, mapped to its source call. */
const CALLS: ReadonlyArray<readonly [binding: string, call: (source: NotificationCenterSource) => Promise<unknown>]> = [
  ['ListNotifications', (source) => source.listNotifications({ view: 'active', unreadOnly: false, cursor: '', limit: 25, search: '', levels: [], sources: [] })],
  ['GetNotification', (source) => source.getNotification(1)],
  ['GetUnreadNotificationCount', (source) => source.getUnreadCount()],
  ['MarkNotificationsRead', (source) => source.markRead([1])],
  ['MarkNotificationsUnread', (source) => source.markUnread([1])],
  ['ArchiveNotifications', (source) => source.archive([1])],
  ['RestoreNotifications', (source) => source.restore([1])],
  ['ExecuteNotificationAction', (source) => source.executeAction(1, 'act-open')],
];

/**
 * Attaches notification-center bindings to a fake Wails `window.go`.
 * @param bindings The bindings by name.
 */
function attachBindings(bindings: Readonly<Record<string, unknown>>) {
  window.go = { desktop: { App: bindings } } as never;
}

describe('createNotificationCenterSource', () => {
  useIsolatedWailsRuntime();

  it('answers what each binding answers, passing ids and filters through, once the bindings attach', async () => {
    const { WAILS_BINDINGS_POLL_MS } = await import('../../wails-bindings.helpers');
    const { createNotificationCenterSource } = await import('../notification-center-source.helpers');
    const listNotifications = vi.fn().mockResolvedValue(PAGE);
    const markRead = vi.fn().mockResolvedValue(MUTATION);
    const markUnread = vi.fn().mockResolvedValue(MUTATION);
    const archive = vi.fn().mockResolvedValue(MUTATION);
    const restore = vi.fn().mockResolvedValue(MUTATION);
    const executeAction = vi.fn().mockResolvedValue({ executed: true, executedAtMs: 5 });
    const source = createNotificationCenterSource();

    const page = source.listNotifications({ view: 'archived', unreadOnly: true, cursor: 'c-1', limit: 10, search: 'one', levels: ['info'], sources: ['download'] });
    attachBindings({
      ListNotifications: listNotifications,
      GetNotification: vi.fn().mockResolvedValue(DETAIL),
      GetUnreadNotificationCount: vi.fn().mockResolvedValue(4),
      MarkNotificationsRead: markRead,
      MarkNotificationsUnread: markUnread,
      ArchiveNotifications: archive,
      RestoreNotifications: restore,
      ExecuteNotificationAction: executeAction,
    });
    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(page).resolves.toEqual(PAGE);
    await expect(source.getNotification(1)).resolves.toEqual(DETAIL);
    await expect(source.getUnreadCount()).resolves.toBe(4);
    await expect(source.markRead([1, 2])).resolves.toEqual(MUTATION);
    await expect(source.markUnread([3])).resolves.toEqual(MUTATION);
    await expect(source.archive([4])).resolves.toEqual(MUTATION);
    await expect(source.restore([5])).resolves.toEqual(MUTATION);
    await expect(source.executeAction(9, 'act-open')).resolves.toEqual({ executed: true, executedAtMs: 5 });
    expect(listNotifications).toHaveBeenCalledExactlyOnceWith({
      view: 'archived',
      unreadOnly: true,
      cursor: 'c-1',
      limit: 10,
      search: 'one',
      levels: ['info'],
      sources: ['download'],
    });
    expect(markRead).toHaveBeenCalledExactlyOnceWith([1, 2]);
    expect(markUnread).toHaveBeenCalledExactlyOnceWith([3]);
    expect(archive).toHaveBeenCalledExactlyOnceWith([4]);
    expect(restore).toHaveBeenCalledExactlyOnceWith([5]);
    expect(executeAction).toHaveBeenCalledExactlyOnceWith(9, 'act-open');
  });

  it.each([
    ['the module is starting', '{"code":"unavailable","message":"notifications is starting"}', { code: 'unavailable', message: 'notifications is starting' }],
    [
      'the module failed',
      '{"code":"failed_precondition","message":"notifications: db closed"}',
      { code: 'failed_precondition', message: 'notifications: db closed' },
    ],
    ['a plain rejection', 'boom', { code: 'internal', message: 'boom' }],
  ])('rejects every call with a BridgeError when %s, never with a fallback', async (_label, rejection, expected) => {
    const { createNotificationCenterSource } = await import('../notification-center-source.helpers');
    attachBindings(Object.fromEntries(CALLS.map(([binding]) => [binding, vi.fn().mockRejectedValue(new Error(rejection))])));
    const source = createNotificationCenterSource();

    for (const [, call] of CALLS) {
      await expect(call(source)).rejects.toMatchObject({ name: 'BridgeError', ...expected });
    }
  });

  it('rejects every call as unavailable when the bindings never attach', async () => {
    const { WAILS_BINDINGS_TIMEOUT_MS } = await import('../../wails-bindings.helpers');
    const { createNotificationCenterSource } = await import('../notification-center-source.helpers');
    const source = createNotificationCenterSource();

    const rejections = CALLS.map(([, call]) =>
      expect(call(source)).rejects.toMatchObject({ name: 'BridgeError', code: 'unavailable', message: expect.stringMatching(/\S/) }),
    );
    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_TIMEOUT_MS);

    await Promise.all(rejections);
  });
});
