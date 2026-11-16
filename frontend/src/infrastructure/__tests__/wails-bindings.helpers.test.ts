import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('wails-bindings.helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  it('detects a live Go binding by name', async () => {
    const { hasGoBinding, hasRuntimeBindings } = await import('../wails-bindings.helpers');

    window.go = { desktop: { App: { GetSeason: vi.fn() } } } as never;

    expect(hasGoBinding('GetSeason')).toBe(true);
    expect(hasGoBinding('CreateSeason')).toBe(false);
    expect(hasRuntimeBindings()).toBe(false);
  });

  it('detects Wails runtime bindings from both runtime event APIs', async () => {
    const { hasRuntimeBindings } = await import('../wails-bindings.helpers');

    window.runtime = { EventsOnMultiple: vi.fn() } as never;
    expect(hasRuntimeBindings()).toBe(true);

    window.runtime = { EventsOn: vi.fn() } as never;
    expect(hasRuntimeBindings()).toBe(true);
  });

  it('resolves immediately when bindings are already ready', async () => {
    const { waitForBindings } = await import('../wails-bindings.helpers');
    const isReady = vi.fn().mockReturnValue(true);

    await expect(waitForBindings(isReady)).resolves.toBe(true);

    expect(isReady).toHaveBeenCalledTimes(1);
  });

  it('polls until delayed bindings become ready', async () => {
    const { WAILS_BINDINGS_POLL_MS, waitForBindings } = await import('../wails-bindings.helpers');
    const isReady = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValue(true);

    const resultPromise = waitForBindings(isReady);

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS * 2);

    await expect(resultPromise).resolves.toBe(true);
    expect(isReady).toHaveBeenCalledTimes(3);
  });

  it('resolves false when bindings never become ready before timeout', async () => {
    const { WAILS_BINDINGS_TIMEOUT_MS, waitForBindings } = await import('../wails-bindings.helpers');

    const resultPromise = waitForBindings(() => false);

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_TIMEOUT_MS);

    await expect(resultPromise).resolves.toBe(false);
  });

  it('invokes a ready Go binding and otherwise returns its source-specific fallback', async () => {
    const { WAILS_BINDINGS_TIMEOUT_MS, invokeGoBinding } = await import('../wails-bindings.helpers');
    const invoke = vi.fn().mockResolvedValue('runtime value');
    const fallback = vi.fn().mockReturnValue('fallback value');

    window.go = { desktop: { App: { GetSeason: invoke } } } as never;

    await expect(invokeGoBinding('GetSeason', invoke, fallback)).resolves.toBe('runtime value');
    expect(fallback).not.toHaveBeenCalled();

    Reflect.deleteProperty(window, 'go');

    const unavailableResult = invokeGoBinding('GetSeason', invoke, fallback);
    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_TIMEOUT_MS);

    await expect(unavailableResult).resolves.toBe('fallback value');
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('shares one runtime attachment and releases it after the last subscriber', async () => {
    const { WAILS_BINDINGS_POLL_MS, WAILS_BINDINGS_TIMEOUT_MS, createRuntimeSubscription } = await import('../wails-bindings.helpers');
    const runtimeUnsubscribe = vi.fn();
    const attachRuntime = vi.fn().mockReturnValue(runtimeUnsubscribe);
    const subscription = createRuntimeSubscription(attachRuntime);
    const firstListener = vi.fn();
    const secondListener = vi.fn();

    const unsubscribeFirst = subscription.subscribe(firstListener);
    const unsubscribeSecond = subscription.subscribe(secondListener);

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_TIMEOUT_MS);

    expect(attachRuntime).toHaveBeenCalledTimes(0);

    window.runtime = { EventsOn: vi.fn() } as never;
    const unsubscribeThird = subscription.subscribe(vi.fn());

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    expect(attachRuntime).toHaveBeenCalledTimes(1);

    const emit = attachRuntime.mock.calls[0]?.[0] as (payload: string) => void;
    emit('updated');

    expect(firstListener).toHaveBeenCalledWith('updated');
    expect(secondListener).toHaveBeenCalledWith('updated');

    unsubscribeFirst();
    unsubscribeSecond();
    expect(runtimeUnsubscribe).not.toHaveBeenCalled();

    unsubscribeThird();
    expect(runtimeUnsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('createRuntimeEventSource', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    Reflect.deleteProperty(window, 'runtime');
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'runtime');
  });

  it('shares one runtime listener per event name and releases it after the last subscriber', async () => {
    const { createRuntimeEventSource } = await import('../wails-bindings.helpers');
    const handlers = new Map<string, (payload: unknown) => void>();
    const released: string[] = [];
    const eventsOnMultiple = vi.fn((eventName: string, callback: (payload: unknown) => void) => {
      handlers.set(eventName, callback);
      return () => released.push(eventName);
    });
    window.runtime = { EventsOnMultiple: eventsOnMultiple } as never;
    const events = createRuntimeEventSource();
    const first = vi.fn();
    const second = vi.fn();
    const other = vi.fn();

    const unsubscribeFirst = events.subscribe('anime.changed', first);
    const unsubscribeSecond = events.subscribe('anime.changed', second);
    const unsubscribeOther = events.subscribe('episodes.changed', other);
    await vi.advanceTimersByTimeAsync(0);

    expect(eventsOnMultiple.mock.calls.map(([eventName]) => eventName)).toEqual(['anime.changed', 'episodes.changed']);
    handlers.get('anime.changed')?.({ id: 'a-1' });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();

    unsubscribeFirst();
    expect(released).toEqual([]);
    unsubscribeSecond();
    unsubscribeOther();
    expect(released).toEqual(['anime.changed', 'episodes.changed']);
  });
});
