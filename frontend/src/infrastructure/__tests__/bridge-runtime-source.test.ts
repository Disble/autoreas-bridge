import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('bridge-runtime-source', () => {
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

  it('resolves degraded defaults for every method when the Go runtime is absent', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();

    const statusPromise = source.getSQLiteStatus();
    const addressPromise = source.getEffectiveAddress();
    const tokenPromise = source.getPairingToken();
    const reconcilePromise = source.triggerReconcile();

    await vi.advanceTimersByTimeAsync(5000);

    await expect(statusPromise).resolves.toBe('runtime unavailable');
    await expect(addressPromise).resolves.toBe('');
    await expect(tokenPromise).resolves.toBe('');
    await expect(reconcilePromise).resolves.toBe('runtime unavailable');
  });

  it('calls GetSQLiteStatus once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource, WAILS_BINDINGS_POLL_MS } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();
    const getSQLiteStatusMock = vi.fn().mockResolvedValue('ok');

    const statusPromise = source.getSQLiteStatus();

    window.go = { main: { App: { GetSQLiteStatus: getSQLiteStatusMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(statusPromise).resolves.toBe('ok');
    expect(getSQLiteStatusMock).toHaveBeenCalledTimes(1);
  });

  it('calls GetEffectiveAddress once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource, WAILS_BINDINGS_POLL_MS } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();
    const getEffectiveAddressMock = vi.fn().mockResolvedValue('192.168.1.10:8080');

    const addressPromise = source.getEffectiveAddress();

    window.go = { main: { App: { GetEffectiveAddress: getEffectiveAddressMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(addressPromise).resolves.toBe('192.168.1.10:8080');
  });

  it('calls GetPairingToken once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource, WAILS_BINDINGS_POLL_MS } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();
    const getPairingTokenMock = vi.fn().mockResolvedValue('token-123');

    const tokenPromise = source.getPairingToken();

    window.go = { main: { App: { GetPairingToken: getPairingTokenMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(tokenPromise).resolves.toBe('token-123');
  });

  it('calls TriggerReconcile once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource, WAILS_BINDINGS_POLL_MS } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();
    const triggerReconcileMock = vi.fn().mockResolvedValue('done');

    const reconcilePromise = source.triggerReconcile();

    window.go = { main: { App: { TriggerReconcile: triggerReconcileMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(reconcilePromise).resolves.toBe('done');
  });

  it('degrades onPairingTokenConsumed to a no-op unsubscribe when the runtime is absent', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source');
    const source = createBridgeRuntimeSource();
    const listener = vi.fn();

    const unsubscribe = source.onPairingTokenConsumed(listener);

    await vi.advanceTimersByTimeAsync(5000);

    expect(() => unsubscribe()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it('shares a single singleton across consumers (no duplicate Wails subscriptions)', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source');
    const eventsOnMultipleMock = vi.fn().mockReturnValue(() => undefined);

    window.runtime = { EventsOnMultiple: eventsOnMultipleMock } as never;

    const sourceA = createBridgeRuntimeSource();
    const sourceB = createBridgeRuntimeSource();

    expect(sourceA).toBe(sourceB);

    const unsubscribeA = sourceA.onPairingTokenConsumed(vi.fn());
    const unsubscribeB = sourceB.onPairingTokenConsumed(vi.fn());

    await vi.advanceTimersByTimeAsync(5000);

    expect(eventsOnMultipleMock).toHaveBeenCalledTimes(1);

    unsubscribeA();
    unsubscribeB();
  });

  it('fires onPairingTokenConsumed listeners when the runtime emits the event', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source');
    let handler: ((...payload: readonly unknown[]) => void) | undefined;
    const eventsOnMultipleMock = vi
      .fn()
      .mockImplementation((_eventName: string, callback: (...payload: readonly unknown[]) => void) => {
        handler = callback;
        return () => undefined;
      });

    window.runtime = { EventsOnMultiple: eventsOnMultipleMock } as never;

    const source = createBridgeRuntimeSource();
    const listener = vi.fn();
    const unsubscribe = source.onPairingTokenConsumed(listener);

    await vi.advanceTimersByTimeAsync(5000);

    handler?.();

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});
