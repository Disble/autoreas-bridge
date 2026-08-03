import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('preferences-source', () => {
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
    const { createPreferencesSource } = await import('../preferences-source/preferences-source.helpers');
    const source = createPreferencesSource();

    const seasonModePromise = source.getSeasonMode();
    const downloadsRootPromise = source.getDownloadsRoot();

    await vi.advanceTimersByTimeAsync(5000);

    await expect(seasonModePromise).resolves.toBe(false);
    await expect(downloadsRootPromise).resolves.toBe('');
  });

  it('preserves live Wails preference values and folder selection results', async () => {
    const getDownloadsRootMock = vi.fn().mockResolvedValue('D:/Downloads');
    const getSeasonModeMock = vi.fn().mockResolvedValue(true);
    const pickFolderMock = vi.fn().mockResolvedValue('D:/Anime');
    const setDownloadsRootMock = vi.fn().mockResolvedValue('saved');
    const getAutoStartEnabledMock = vi.fn().mockResolvedValue(true);
    const setAutoStartEnabledMock = vi.fn().mockResolvedValue('ok');
    window.go = {
      main: {
        App: {
          GetDownloadsRoot: getDownloadsRootMock,
          GetSeasonMode: getSeasonModeMock,
          PickFolder: pickFolderMock,
          SetDownloadsRoot: setDownloadsRootMock,
          GetAutoStartEnabled: getAutoStartEnabledMock,
          SetAutoStartEnabled: setAutoStartEnabledMock,
        },
      },
    } as never;

    const { createPreferencesSource } = await import('../preferences-source/preferences-source.helpers');
    const source = createPreferencesSource();

    await expect(source.getSeasonMode()).resolves.toBe(true);
    await expect(source.getDownloadsRoot()).resolves.toBe('D:/Downloads');
    await expect(source.setDownloadsRoot('D:/Downloads')).resolves.toBe('saved');
    await expect(source.pickFolder('Choose anime directory')).resolves.toBe('D:/Anime');
    await expect(source.getAutoStartEnabled()).resolves.toBe(true);
    await expect(source.setAutoStartEnabled(false)).resolves.toBe('ok');
    expect(getSeasonModeMock).toHaveBeenCalledTimes(1);
    expect(getDownloadsRootMock).toHaveBeenCalledTimes(1);
    expect(setDownloadsRootMock).toHaveBeenCalledWith('D:/Downloads');
    expect(pickFolderMock).toHaveBeenCalledWith('Choose anime directory');
    expect(getAutoStartEnabledMock).toHaveBeenCalledTimes(1);
    expect(setAutoStartEnabledMock).toHaveBeenCalledWith(false);
  });

  it('keeps source-adapter declarations in colocated sibling modules', () => {
    const sourceRoot = join(process.cwd(), 'src/infrastructure/preferences-source');
    const indexPath = join(sourceRoot, 'index.ts');
    const typesPath = join(sourceRoot, 'preferences-source.types.ts');
    const helperPath = join(sourceRoot, 'preferences-source.helpers.ts');
    const helperText = readFileSync(helperPath, 'utf8');

    expect(existsSync(indexPath)).toBe(false);
    expect(existsSync(typesPath)).toBe(true);
    expect(existsSync(helperPath)).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/infrastructure/preferences-source.ts'))).toBe(false);
    expect(helperText).toContain("from '../wails-bindings.helpers'");
  });

});
