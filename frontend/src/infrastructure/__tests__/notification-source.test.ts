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

  it('shares a single singleton across multiple subscribers (no duplicate Wails subscriptions)', async () => {
    const { createNotificationSource } = await import('../notification-source/notification-source.helpers');
    const eventsOnMultipleMock = vi.fn().mockReturnValue(() => undefined);

    window.runtime = { EventsOnMultiple: eventsOnMultipleMock } as never;

    const sourceA = createNotificationSource();
    const sourceB = createNotificationSource();

    expect(sourceA).toBe(sourceB);

    const unsubscribeA = sourceA.subscribe(vi.fn());
    const unsubscribeB = sourceB.subscribe(vi.fn());

    await vi.advanceTimersByTimeAsync(5000);

    expect(eventsOnMultipleMock).toHaveBeenCalledTimes(1);

    unsubscribeA();
    unsubscribeB();
  });

  it('forwards live notification.push events to subscribed listeners', async () => {
    const { createNotificationSource } = await import('../notification-source/notification-source.helpers');
    let handler: ((payload: unknown) => void) | undefined;
    const eventsOnMultipleMock = vi
      .fn()
      .mockImplementation((_eventName: string, callback: (payload: unknown) => void) => {
        handler = callback;
        return () => undefined;
      });

    window.runtime = { EventsOnMultiple: eventsOnMultipleMock } as never;

    const source = createNotificationSource();
    const listener = vi.fn();
    const unsubscribe = source.subscribe(listener);

    await vi.advanceTimersByTimeAsync(5000);

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

    unsubscribe();
  });

  it('forwards notification.archived events to archived subscribers', async () => {
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
    const pushListener = vi.fn();
    const unsubscribeArchived = source.subscribeArchived(archivedListener);
    const unsubscribePush = source.subscribe(pushListener);

    await vi.advanceTimersByTimeAsync(5000);

    handlers.get('notification.archived')?.([7, 9]);

    expect(archivedListener).toHaveBeenCalledWith([7, 9]);
    // The two streams are independent: an archive must not reach the toast
    // push listener, which would render a toast for a record being closed.
    expect(pushListener).not.toHaveBeenCalled();

    unsubscribeArchived();
    unsubscribePush();
  });

  it('subscribes to the exact "notification.archived" event name', async () => {
    const { createNotificationSource } = await import('../notification-source/notification-source.helpers');
    const eventsOnMultipleMock = vi.fn().mockReturnValue(() => undefined);

    window.runtime = { EventsOnMultiple: eventsOnMultipleMock } as never;

    const source = createNotificationSource();
    const unsubscribe = source.subscribeArchived(vi.fn());

    await vi.advanceTimersByTimeAsync(5000);

    // Spelled as a literal on purpose: the backend emits this exact string,
    // so reading the constant under test would pin nothing.
    expect(eventsOnMultipleMock).toHaveBeenCalledWith('notification.archived', expect.any(Function), -1);

    unsubscribe();
  });

  it('subscribes to the exact "notification.push" event name', async () => {
    const { createNotificationSource } = await import('../notification-source/notification-source.helpers');
    const eventsOnMultipleMock = vi.fn().mockReturnValue(() => undefined);

    window.runtime = { EventsOnMultiple: eventsOnMultipleMock } as never;

    const source = createNotificationSource();
    const unsubscribe = source.subscribe(vi.fn());

    await vi.advanceTimersByTimeAsync(5000);

    expect(eventsOnMultipleMock).toHaveBeenCalledWith(
      'notification.push',
      expect.any(Function),
      -1,
    );

    unsubscribe();
  });

  it('releases the runtime listener once the last subscriber unsubscribes', async () => {
    const { createNotificationSource } = await import('../notification-source/notification-source.helpers');
    const runtimeUnsubscribeMock = vi.fn();
    const eventsOnMultipleMock = vi.fn().mockReturnValue(runtimeUnsubscribeMock);

    window.runtime = { EventsOnMultiple: eventsOnMultipleMock } as never;

    const source = createNotificationSource();
    const unsubscribe = source.subscribe(vi.fn());

    await vi.advanceTimersByTimeAsync(5000);

    unsubscribe();

    expect(runtimeUnsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('keeps source-adapter declarations in colocated sibling modules', () => {
    const sourceRoot = join(process.cwd(), 'src/infrastructure/notification-source');
    const indexPath = join(sourceRoot, 'index.ts');
    const typesPath = join(sourceRoot, 'notification-source.types.ts');
    const helperPath = join(sourceRoot, 'notification-source.helpers.ts');
    const helperText = readFileSync(helperPath, 'utf8');

    expect(existsSync(indexPath)).toBe(false);
    expect(existsSync(typesPath)).toBe(true);
    expect(existsSync(helperPath)).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/infrastructure/notification-source.ts'))).toBe(false);
    expect(helperText).toContain("from '../wails-bindings.helpers'");
  });
});
