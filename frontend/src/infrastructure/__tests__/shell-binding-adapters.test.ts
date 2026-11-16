import { describe, expect, it, vi } from 'vitest';
import { useIsolatedWailsRuntime } from './bridge-runtime-source.test-support';

/** A coded internal failure exactly as the desktop error formatter sends it. */
const codedFailure = '{"code":"internal","message":"open file dialog: dialog crashed"}';

/** Builds a Wails binding that rejects with the coded internal failure. */
function rejectingBinding() {
  return vi.fn().mockRejectedValue(new Error(codedFailure));
}

describe('shell binding adapters', () => {
  useIsolatedWailsRuntime();

  it.each([
    ['bridge runtime pickFile', 'PickFile', async () => (await import('../bridge-runtime-source/bridge-runtime-source.helpers')).bridgeRuntimeSource.pickFile('Cover')],
    ['bridge runtime pickFolder', 'PickFolder', async () => (await import('../bridge-runtime-source/bridge-runtime-source.helpers')).bridgeRuntimeSource.pickFolder('Folder')],
    ['season pickFolder', 'PickFolder', async () => (await import('../season-source/season-source.helpers')).seasonSource.pickFolder('Folder')],
    ['preferences pickFolder', 'PickFolder', async () => (await import('../preferences-source/preferences-source.helpers')).createPreferencesSource().pickFolder('Folder')],
  ] as const)('%s reads a failed dialog as a cancel, as the pickers did before', async (_name, binding, pick) => {
    window.go = { desktop: { App: { [binding]: rejectingBinding() } } } as never;

    await expect(pick()).resolves.toBe('');
  });

  it('bridge runtime pickFile still resolves the chosen path', async () => {
    const pickFile = vi.fn().mockResolvedValue('C:/covers/a.png');
    window.go = { desktop: { App: { PickFile: pickFile } } } as never;
    const { bridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');

    await expect(bridgeRuntimeSource.pickFile('Cover')).resolves.toBe('C:/covers/a.png');
    expect(pickFile).toHaveBeenCalledWith('Cover');
  });

  it('metadata lookup reports a failed search and detail as the error outcome carrying the binding message', async () => {
    window.go = { desktop: { App: { SearchMyAnimeList: rejectingBinding(), GetMyAnimeListDetail: rejectingBinding() } } } as never;
    const { createMetadataLookupSource } = await import('../metadata-lookup-source/metadata-lookup-source.helpers');
    const source = createMetadataLookupSource();

    await expect(source.SearchMyAnimeList('Bleach')).resolves.toEqual({ outcome: 'error', message: 'open file dialog: dialog crashed', candidates: [] });
    await expect(source.GetMyAnimeListDetail(1)).resolves.toEqual({ outcome: 'error', message: 'open file dialog: dialog crashed' });
  });

  it('downloads rejects a failed JDownloader limit read with its plain message', async () => {
    window.go = { desktop: { App: { GetJDMaxSimultaneousDownloads: rejectingBinding() } } } as never;
    const { createDownloadsSource } = await import('../download-runtime-source/downloads-source.helpers');

    await expect(createDownloadsSource().getJDMaxSimultaneousDownloads()).rejects.toMatchObject({
      name: 'BridgeError',
      code: 'internal',
      message: 'open file dialog: dialog crashed',
    });
  });
});
