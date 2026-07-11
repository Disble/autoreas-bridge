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

    window.go = { main: { App: { GetSeason: vi.fn() } } } as never;

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
});
