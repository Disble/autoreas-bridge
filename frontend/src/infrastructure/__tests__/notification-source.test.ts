import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('notification-source', () => {
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

  it('degrades subscribe to a no-op unsubscribe when the runtime is absent', async () => {
    const { createNotificationSource } = await import('../notification-source/notification-source.helpers');
    const source = createNotificationSource();
    const listener = vi.fn();

    const unsubscribe = source.subscribe(listener);

    await vi.advanceTimersByTimeAsync(5000);

    expect(() => unsubscribe()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it('shares one source and one exact "notification.push" subscription across subscribers, forwards live push events, and releases the runtime listener once the last subscriber unsubscribes', async () => {
    const { createNotificationSource } = await import('../notification-source/notification-source.helpers');
    let handler: ((payload: unknown) => void) | undefined;
    const runtimeUnsubscribeMock = vi.fn();
    const eventsOnMultipleMock = vi
      .fn()
      .mockImplementation((_eventName: string, callback: (payload: unknown) => void) => {
        handler = callback;
        return runtimeUnsubscribeMock;
      });

    window.runtime = { EventsOnMultiple: eventsOnMultipleMock } as never;

    const sourceA = createNotificationSource();
    const sourceB = createNotificationSource();

    expect(sourceA).toBe(sourceB);

    const listener = vi.fn();
    const unsubscribeA = sourceA.subscribe(listener);
    const unsubscribeB = sourceB.subscribe(vi.fn());

    await vi.advanceTimersByTimeAsync(5000);

    // No duplicate Wails subscriptions, on the literal event name the backend emits.
    expect(eventsOnMultipleMock).toHaveBeenCalledExactlyOnceWith('notification.push', expect.any(Function), -1);

    const payload = {
      Title: 'Download finished',
      Body: '2 episodes downloaded',
      Level: 'success',
      Source: 'download',
      CorrelationID: 'run-1',
      Timestamp: '2026-06-22T00:00:00Z',
    };

    handler?.(payload);

    expect(listener).toHaveBeenCalledWith(payload);

    unsubscribeA();
    expect(runtimeUnsubscribeMock).not.toHaveBeenCalled();
    unsubscribeB();

    expect(runtimeUnsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('subscribes the exact "notification.archived" and "notification.navigate" event names, forwards each stream only to its own subscribers, and drops a navigate payload that is not a usable route', async () => {
    const { createNotificationSource } = await import('../notification-source/notification-source.helpers');
    const handlers = new Map<string, (payload: unknown) => void>();
    const eventsOnMultipleMock = vi
      .fn()
      .mockImplementation((eventName: string, callback: (payload: unknown) => void) => {
        handlers.set(eventName, callback);
        return () => undefined;
      });

    window.runtime = { EventsOnMultiple: eventsOnMultipleMock } as never;

    const source = createNotificationSource();
    const archivedListener = vi.fn();
    const navigateListener = vi.fn();
    const pushListener = vi.fn();
    const unsubscribeArchived = source.subscribeArchived(archivedListener);
    const unsubscribeNavigate = source.subscribeNavigate(navigateListener);
    const unsubscribePush = source.subscribe(pushListener);

    await vi.advanceTimersByTimeAsync(5000);

    // Spelled as literals on purpose: app_notification_center.go emits these
    // exact strings, so reading the constants under test would pin nothing --
    // and a mismatch here is precisely the bug that shipped, where the backend
    // emitted and no frontend name matched.
    expect(eventsOnMultipleMock).toHaveBeenCalledWith('notification.archived', expect.any(Function), -1);
    expect(eventsOnMultipleMock).toHaveBeenCalledWith('notification.navigate', expect.any(Function), -1);

    handlers.get('notification.archived')?.([7, 9]);

    expect(archivedListener).toHaveBeenCalledWith([7, 9]);
    expect(navigateListener).not.toHaveBeenCalled();
    // The streams are independent: an archive must not reach the toast
    // push listener, which would render a toast for a record being closed.
    expect(pushListener).not.toHaveBeenCalled();

    handlers.get('notification.navigate')?.('/downloads');

    expect(navigateListener).toHaveBeenCalledExactlyOnceWith('/downloads');
    expect(archivedListener).toHaveBeenCalledTimes(1);
    // A navigation must not reach the toast push listener: it carries a route,
    // not a notification, and rendering it as one would toast a bare path.
    expect(pushListener).not.toHaveBeenCalled();

    // The backend refuses a route-less token rather than emitting one, so
    // neither of these can arrive from the intent. The boundary still refuses
    // to forward them: navigating to '' resolves to the current route's
    // directory, which would move the user somewhere nobody asked for.
    handlers.get('notification.navigate')?.('');
    handlers.get('notification.navigate')?.(undefined);
    handlers.get('notification.navigate')?.({ route: '/downloads' });

    expect(navigateListener).toHaveBeenCalledTimes(1);

    unsubscribeArchived();
    unsubscribeNavigate();
    unsubscribePush();
  });

  it('keeps source-adapter declarations in colocated sibling modules', () => {
    const sourceRoot = join(process.cwd(), 'src/infrastructure/notification-source');
    const indexPath = join(sourceRoot, 'index.ts');
    const typesPath = join(sourceRoot, 'notification-source.types.ts');
    const helperPath = join(sourceRoot, 'notification-source.helpers.ts');
    const helperText = readFileSync(helperPath, 'utf8');

    expect(existsSync(indexPath)).toBe(false);
    // The port is `NotificationPushSource` in shared/contracts; the adapter declares no type of its own.
    expect(existsSync(typesPath)).toBe(false);
    expect(existsSync(helperPath)).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/infrastructure/notification-source.ts'))).toBe(false);
    expect(helperText).toContain("from '../wails-bindings.helpers'");
    expect(helperText).toContain("from '../../shared/contracts/notification-push.types'");
  });
});
