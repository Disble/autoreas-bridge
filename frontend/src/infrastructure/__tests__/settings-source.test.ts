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
      PickFolder: vi.fn().mockResolvedValue('F:/Chosen'),
    };
    window.go = { desktop: { App: app } } as never;
    const { createSettingsSource } = await import('../settings-source/settings-source.helpers');
    const source = createSettingsSource();

    await expect(source.getLibraryRoot()).resolves.toBe('D:/Anime');
    await expect(source.setLibraryRoot('F:/Anime')).resolves.toBeUndefined();
    await expect(source.previewLibraryRootChange('F:/Anime')).resolves.toBe(preview);
    await expect(source.getAutoStartEnabled()).resolves.toBe(true);
    await expect(source.setAutoStartEnabled(false)).resolves.toBeUndefined();
    await expect(source.pickFolder('Choose library root folder')).resolves.toBe('F:/Chosen');
    expect(app.SetLibraryRoot).toHaveBeenCalledWith('F:/Anime');
    expect(app.PreviewLibraryRootChange).toHaveBeenCalledWith('F:/Anime');
    expect(app.SetAutoStartEnabled).toHaveBeenCalledWith(false);
    expect(app.PickFolder).toHaveBeenCalledWith('Choose library root folder');
  });

  it('reads a failed folder dialog as a cancel, as every folder picker does', async () => {
    window.go = {
      desktop: { App: { PickFolder: vi.fn().mockRejectedValue(new Error('{"code":"internal","message":"open folder dialog: crashed"}')) } },
    } as never;
    const { createSettingsSource } = await import('../settings-source/settings-source.helpers');

    await expect(createSettingsSource().pickFolder('Choose library root folder')).resolves.toBe('');
  });
});
