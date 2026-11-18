import { describe, expect, it, vi } from 'vitest';
import { useIsolatedWailsRuntime } from './bridge-runtime-source.test-support';

/** A coded failure exactly as the desktop error formatter sends it. */
const codedFailure = '{"code":"unavailable","message":"settings is starting"}';

/**
 * Calls one settings source method with a fixed argument.
 * @param method The port method.
 * @returns The call's promise.
 */
async function callSettings(method: string): Promise<unknown> {
  const { createSettingsSource } = await import('../settings-source/settings-source.helpers');
  const source = createSettingsSource();
  switch (method) {
    case 'getLibraryRoot':
      return source.getLibraryRoot();
    case 'setLibraryRoot':
      return source.setLibraryRoot('F:/Anime');
    case 'previewLibraryRootChange':
      return source.previewLibraryRootChange('F:/Anime');
    case 'getAutoStartEnabled':
      return source.getAutoStartEnabled();
    case 'getKeymap':
      return source.getKeymap();
    case 'setKeymap':
      return source.setKeymap('');
    case 'getSeasonCheckTime':
      return source.getSeasonCheckTime();
    case 'setSeasonCheckTime':
      return source.setSeasonCheckTime('07:30');
    default:
      return source.setAutoStartEnabled(false);
  }
}

/** Every `settings` module method of the port with the binding it calls. */
const SETTINGS_CALLS = [
  ['getLibraryRoot', 'GetLibraryRoot'],
  ['setLibraryRoot', 'SetLibraryRoot'],
  ['previewLibraryRootChange', 'PreviewLibraryRootChange'],
  ['getAutoStartEnabled', 'GetAutoStartEnabled'],
  ['setAutoStartEnabled', 'SetAutoStartEnabled'],
  ['getKeymap', 'GetKeymap'],
  ['setKeymap', 'SetKeymap'],
  ['getSeasonCheckTime', 'GetSeasonCheckTime'],
  ['setSeasonCheckTime', 'SetSeasonCheckTime'],
] as const;

describe('settings-source', () => {
  useIsolatedWailsRuntime();

  it.each(SETTINGS_CALLS)('%s rejects a coded failure with its code and plain message', async (method, binding) => {
    window.go = { desktop: { App: { [binding]: vi.fn().mockRejectedValue(new Error(codedFailure)) } } } as never;

    await expect(callSettings(method)).rejects.toMatchObject({ name: 'BridgeError', code: 'unavailable', message: 'settings is starting' });
  });

  it.each(SETTINGS_CALLS)('%s rejects as unavailable, never a default, when its binding never attaches', async (method, binding) => {
    const { WAILS_BINDINGS_TIMEOUT_MS } = await import('../wails-bindings.helpers');

    const assertion = expect(callSettings(method)).rejects.toMatchObject({
      name: 'BridgeError',
      code: 'unavailable',
      message: `the ${binding} binding is not attached`,
    });
    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_TIMEOUT_MS);

    await assertion;
  });

  it('passes each call its argument and resolves what the binding answers', async () => {
    const preview = { oldRoot: 'D:/Anime', moves: [], kept: [] };
    const app = {
      GetLibraryRoot: vi.fn().mockResolvedValue('D:/Anime'),
      SetLibraryRoot: vi.fn().mockResolvedValue(undefined),
      PreviewLibraryRootChange: vi.fn().mockResolvedValue(preview),
      GetAutoStartEnabled: vi.fn().mockResolvedValue(true),
      SetAutoStartEnabled: vi.fn().mockResolvedValue(undefined),
      GetKeymap: vi.fn().mockResolvedValue(''),
      SetKeymap: vi.fn().mockResolvedValue(undefined),
      GetSeasonCheckTime: vi.fn().mockResolvedValue('21:00'),
      SetSeasonCheckTime: vi.fn().mockResolvedValue(undefined),
    };
    window.go = { desktop: { App: app } } as never;
    const { createSettingsSource } = await import('../settings-source/settings-source.helpers');
    const source = createSettingsSource();

    await expect(source.getLibraryRoot()).resolves.toBe('D:/Anime');
    await expect(source.setLibraryRoot('F:/Anime')).resolves.toBeUndefined();
    await expect(source.previewLibraryRootChange('F:/Anime')).resolves.toBe(preview);
    await expect(source.getAutoStartEnabled()).resolves.toBe(true);
    await expect(source.setAutoStartEnabled(false)).resolves.toBeUndefined();
    // An empty keymap is a valid "nothing rebound" answer, passed through as the opaque document it is.
    await expect(source.getKeymap()).resolves.toBe('');
    await expect(source.setKeymap('{"version":1,"bindings":{}}')).resolves.toBeUndefined();
    expect(app.SetKeymap).toHaveBeenCalledWith('{"version":1,"bindings":{}}');
    await expect(source.getSeasonCheckTime()).resolves.toBe('21:00');
    await expect(source.setSeasonCheckTime('07:30')).resolves.toBeUndefined();
    expect(app.SetSeasonCheckTime).toHaveBeenCalledWith('07:30');
    expect(app.SetLibraryRoot).toHaveBeenCalledWith('F:/Anime');
    expect(app.PreviewLibraryRootChange).toHaveBeenCalledWith('F:/Anime');
    expect(app.SetAutoStartEnabled).toHaveBeenCalledWith(false);
  });
});
