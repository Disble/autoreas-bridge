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
    const libraryRootPromise = source.getLibraryRoot();

    await vi.advanceTimersByTimeAsync(5000);

    await expect(seasonModePromise).resolves.toBe(false);
    await expect(libraryRootPromise).resolves.toBe('');
  });

  it('preserves live Wails preference values and folder selection results', async () => {
    const getLibraryRootMock = vi.fn().mockResolvedValue('D:/Downloads');
    const getSeasonModeMock = vi.fn().mockResolvedValue(true);
    const pickFolderMock = vi.fn().mockResolvedValue('D:/Anime');
    window.go = {
      desktop: {
        App: {
          GetLibraryRoot: getLibraryRootMock,
          GetSeasonMode: getSeasonModeMock,
          PickFolder: pickFolderMock,
        },
      },
    } as never;

    const { createPreferencesSource } = await import('../preferences-source/preferences-source.helpers');
    const source = createPreferencesSource();

    await expect(source.getSeasonMode()).resolves.toBe(true);
    await expect(source.getLibraryRoot()).resolves.toBe('D:/Downloads');
    await expect(source.pickFolder('Choose anime directory')).resolves.toBe('D:/Anime');
    expect(getSeasonModeMock).toHaveBeenCalledTimes(1);
    expect(getLibraryRootMock).toHaveBeenCalledTimes(1);
    expect(pickFolderMock).toHaveBeenCalledWith('Choose anime directory');
  });

  it('reads a library root the settings module refuses as unset, as anime create and season intake did before', async () => {
    window.go = {
      desktop: { App: { GetLibraryRoot: vi.fn().mockRejectedValue(new Error('{"code":"unavailable","message":"settings is starting"}')) } },
    } as never;

    const { createPreferencesSource } = await import('../preferences-source/preferences-source.helpers');

    await expect(createPreferencesSource().getLibraryRoot()).resolves.toBe('');
  });

  it('reads season mode as off while the season module rejects, as before the binding returned an error', async () => {
    const getSeasonModeMock = vi.fn().mockRejectedValue(new Error('{"code":"unavailable","message":"season is starting"}'));
    window.go = { desktop: { App: { GetSeasonMode: getSeasonModeMock } } } as never;

    const { createPreferencesSource } = await import('../preferences-source/preferences-source.helpers');

    await expect(createPreferencesSource().getSeasonMode()).resolves.toBe(false);
    expect(getSeasonModeMock).toHaveBeenCalledTimes(1);
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
