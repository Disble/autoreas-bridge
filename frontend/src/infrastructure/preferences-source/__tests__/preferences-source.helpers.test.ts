import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Covers the keymap pair on `createPreferencesSource`: `getKeymap`/`setKeymap`
 * degrade to a safe default while the Wails bindings are not attached, and
 * pass the opaque document through unchanged once they are -- this adapter
 * never parses or validates the document (design.md D5).
 */
describe('preferences-source.helpers — keymap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    Reflect.deleteProperty(window, 'go');
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'go');
  });

  it('degrades to safe defaults when the runtime is unavailable', async () => {
    const { createPreferencesSource } = await import('../preferences-source.helpers');
    const source = createPreferencesSource();

    const getKeymapPromise = source.getKeymap();
    const setKeymapPromise = source.setKeymap('{"version":1,"overrides":{}}');

    await vi.advanceTimersByTimeAsync(5000);

    await expect(getKeymapPromise).resolves.toBe('');
    await expect(setKeymapPromise).resolves.toBe('runtime unavailable');
  });

  it('passes the opaque keymap document through the live Wails bindings unchanged', async () => {
    const document = '{not json: alt++';
    const getKeymapMock = vi.fn().mockResolvedValue(document);
    const setKeymapMock = vi.fn().mockResolvedValue('ok');
    window.go = {
      desktop: {
        App: {
          GetKeymap: getKeymapMock,
          SetKeymap: setKeymapMock,
        },
      },
    } as never;

    const { createPreferencesSource } = await import('../preferences-source.helpers');
    const source = createPreferencesSource();

    await expect(source.getKeymap()).resolves.toBe(document);
    await expect(source.setKeymap(document)).resolves.toBe('ok');
    expect(getKeymapMock).toHaveBeenCalledTimes(1);
    expect(setKeymapMock).toHaveBeenCalledWith(document);
  });
});
