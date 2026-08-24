import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * RED-first coverage for the notification center source adapter (task
 * 3a.1.2): a successful Wails binding call maps to the typed page/detail/
 * mutation result, and every method degrades to a `degraded: true` result
 * instead of throwing while the bindings are unavailable. Extends beyond the
 * task's literally-named `List`/`Get` scenarios to all six bindings under
 * strict TDD, mirroring how Slice 2's 2.2.5 added tests beyond its own
 * literal task text once the full binding surface came into scope.
 */
describe('notification-center-source', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  it('degrades listNotifications to an empty, degraded page when the bindings are absent', async () => {
    const { createNotificationCenterSource } = await import('../notification-center-source.helpers');
    const source = createNotificationCenterSource();

    const pagePromise = source.listNotifications({
      view: 'active',
      unreadOnly: false,
      search: '',
      sources: [],
      levels: [],
      cursor: '',
      limit: 25,
    });

    await vi.advanceTimersByTimeAsync(5000);

    await expect(pagePromise).resolves.toEqual({
      items: [],
      appliedLimit: 0,
      totalEver: 0,
      degraded: true,
    });
  });

  it('degrades getNotification to a not-found, degraded result when the bindings are absent', async () => {
    const { createNotificationCenterSource } = await import('../notification-center-source.helpers');
    const source = createNotificationCenterSource();

    const resultPromise = source.getNotification(1);

    await vi.advanceTimersByTimeAsync(5000);

    const result = await resultPromise;
    expect(result.found).toBe(false);
    expect(result.degraded).toBe(true);
  });

  it('degrades getUnreadCount to 0 when the bindings are absent', async () => {
    const { createNotificationCenterSource } = await import('../notification-center-source.helpers');
    const source = createNotificationCenterSource();

    const countPromise = source.getUnreadCount();

    await vi.advanceTimersByTimeAsync(5000);

    await expect(countPromise).resolves.toBe(0);
  });

  it('degrades markRead/archive/restore to a degraded mutation result when the bindings are absent', async () => {
    const { createNotificationCenterSource } = await import('../notification-center-source.helpers');
    const source = createNotificationCenterSource();

    const markPromise = source.markRead([1]);
    const archivePromise = source.archive([1]);
    const restorePromise = source.restore([1]);

    await vi.advanceTimersByTimeAsync(5000);

    const degradedResult = { affected: 0, unreadCount: 0, degraded: true };
    await expect(markPromise).resolves.toEqual(degradedResult);
    await expect(archivePromise).resolves.toEqual(degradedResult);
    await expect(restorePromise).resolves.toEqual(degradedResult);
  });

  it('maps a successful ListNotifications call to the typed page once bindings become ready', async () => {
    const { createNotificationCenterSource } = await import('../notification-center-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../../wails-bindings.helpers');
    const source = createNotificationCenterSource();
    const listMock = vi.fn().mockResolvedValue({
      items: [{ id: 1, createdAtMs: 1000, title: 'A', body: 'B', level: 'info', source: 'download', actionCount: 0 }],
      appliedLimit: 25,
      totalEver: 1,
      degraded: false,
    });

    const request = { view: 'active', unreadOnly: false, search: '', sources: [], levels: [], cursor: '', limit: 25 };
    const pagePromise = source.listNotifications(request);

    window.go = { main: { App: { ListNotifications: listMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(pagePromise).resolves.toEqual({
      items: [{ id: 1, createdAtMs: 1000, title: 'A', body: 'B', level: 'info', source: 'download', actionCount: 0 }],
      appliedLimit: 25,
      totalEver: 1,
      degraded: false,
    });
    expect(listMock).toHaveBeenCalledWith(request);
  });

  it('maps a successful GetNotification call to the typed detail result once bindings become ready', async () => {
    const { createNotificationCenterSource } = await import('../notification-center-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../../wails-bindings.helpers');
    const source = createNotificationCenterSource();
    const getMock = vi.fn().mockResolvedValue({
      found: true,
      item: {
        id: 1,
        createdAtMs: 1000,
        title: 'A',
        body: 'B',
        level: 'info',
        source: 'download',
        actionCount: 1,
        rows: [],
        actions: [],
      },
      degraded: false,
    });

    const resultPromise = source.getNotification(1);

    window.go = { main: { App: { GetNotification: getMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);
    await resultPromise;

    expect(getMock).toHaveBeenCalledWith(1);
  });

  it('calls MarkNotificationsRead/ArchiveNotifications/RestoreNotifications with the given ids once bindings become ready', async () => {
    const { createNotificationCenterSource } = await import('../notification-center-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../../wails-bindings.helpers');
    const source = createNotificationCenterSource();
    const mutationResult = { affected: 1, unreadCount: 0, degraded: false };
    const markMock = vi.fn().mockResolvedValue(mutationResult);
    const archiveMock = vi.fn().mockResolvedValue(mutationResult);
    const restoreMock = vi.fn().mockResolvedValue(mutationResult);

    const markPromise = source.markRead([7]);
    const archivePromise = source.archive([7]);
    const restorePromise = source.restore([7]);

    window.go = {
      main: {
        App: {
          MarkNotificationsRead: markMock,
          ArchiveNotifications: archiveMock,
          RestoreNotifications: restoreMock,
        },
      },
    } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);
    await Promise.all([markPromise, archivePromise, restorePromise]);

    expect(markMock).toHaveBeenCalledWith([7]);
    expect(archiveMock).toHaveBeenCalledWith([7]);
    expect(restoreMock).toHaveBeenCalledWith([7]);
  });

  it('degrades executeAction to the intent_unregistered refusal when the bindings are absent', async () => {
    const { createNotificationCenterSource } = await import('../notification-center-source.helpers');
    const source = createNotificationCenterSource();

    const resultPromise = source.executeAction(1, 'action-1');

    await vi.advanceTimersByTimeAsync(5000);

    await expect(resultPromise).resolves.toEqual({ executed: false, reason: 'intent_unregistered' });
  });

  it('maps a successful ExecuteNotificationAction call to the typed result once bindings become ready', async () => {
    const { createNotificationCenterSource } = await import('../notification-center-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../../wails-bindings.helpers');
    const source = createNotificationCenterSource();
    const executeMock = vi.fn().mockResolvedValue({ executed: true, executedAtMs: 1_700_000_000_000 });

    const resultPromise = source.executeAction(1, 'action-1');

    window.go = { main: { App: { ExecuteNotificationAction: executeMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(resultPromise).resolves.toEqual({ executed: true, executedAtMs: 1_700_000_000_000 });
    expect(executeMock).toHaveBeenCalledWith(1, 'action-1');
  });

  it('shares a single singleton across multiple createNotificationCenterSource calls', async () => {
    const { createNotificationCenterSource } = await import('../notification-center-source.helpers');

    expect(createNotificationCenterSource()).toBe(createNotificationCenterSource());
  });

  it('reports the notification center runtime as unavailable when the bindings are absent', async () => {
    const { isNotificationCenterRuntimeAvailable } = await import('../notification-center-source.helpers');

    expect(isNotificationCenterRuntimeAvailable()).toBe(false);
  });

  it('reports the notification center runtime as available once every binding is attached', async () => {
    const { isNotificationCenterRuntimeAvailable } = await import('../notification-center-source.helpers');

    window.go = {
      main: {
        App: {
          ListNotifications: vi.fn(),
          GetNotification: vi.fn(),
          GetUnreadNotificationCount: vi.fn(),
          MarkNotificationsRead: vi.fn(),
          ArchiveNotifications: vi.fn(),
          RestoreNotifications: vi.fn(),
          ExecuteNotificationAction: vi.fn(),
        },
      },
    } as never;

    expect(isNotificationCenterRuntimeAvailable()).toBe(true);
  });

  it('reports the notification center runtime as unavailable when only some bindings are attached', async () => {
    const { isNotificationCenterRuntimeAvailable } = await import('../notification-center-source.helpers');

    window.go = { main: { App: { ListNotifications: vi.fn() } } } as never;

    expect(isNotificationCenterRuntimeAvailable()).toBe(false);
  });
});
