import { describe, expect, it, vi } from 'vitest';
import { useIsolatedWailsRuntime } from './bridge-runtime-source.test-support';

describe('bridge-runtime-source cover and events', () => {
  useIsolatedWailsRuntime();

  // The episode schedule and day counts moved to `createEpisodesSource`
  // (`episodes-source.helpers.ts`), which rejects instead of degrading to [] (ADR-032).
  it('degrades covers while runtime is absent', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const source = createBridgeRuntimeSource();
    const coverPromise = source.getAnimeCover?.('anime-1');
    const previewPromise = source.previewAnimeCover?.('D:/Anime/cover.jpg');
    await vi.advanceTimersByTimeAsync(5000);
    await expect(coverPromise).resolves.toEqual({ source: 'placeholder' });
    await expect(previewPromise).resolves.toEqual({ source: 'placeholder' });
  });

  // The Editor calls moved to `createAnimeEditorSource` (`anime-editor-source.helpers.ts`),
  // which rejects as `unavailable` instead of answering an error outcome.
  it('calls cover bindings once ready', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../wails-bindings.helpers');
    const source = createBridgeRuntimeSource();
    const getAnimeCover = vi.fn().mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,abc', source: 'cover' });
    const previewAnimeCover = vi.fn().mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,draft', source: 'cover' });
    const coverPromise = source.getAnimeCover?.('anime-1');
    const previewPromise = source.previewAnimeCover?.('D:/Anime/cover.jpg');
    window.go = { desktop: { App: { GetAnimeCover: getAnimeCover, PreviewAnimeCover: previewAnimeCover } } } as never;
    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);
    await expect(coverPromise).resolves.toEqual({ dataUrl: 'data:image/jpeg;base64,abc', source: 'cover' });
    await expect(previewPromise).resolves.toEqual({ dataUrl: 'data:image/jpeg;base64,draft', source: 'cover' });
    expect(previewAnimeCover).toHaveBeenCalledExactlyOnceWith('D:/Anime/cover.jpg');
  });
});
