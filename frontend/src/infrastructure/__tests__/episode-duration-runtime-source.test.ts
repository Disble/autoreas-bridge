import { describe, expect, it, vi } from 'vitest';
import { useIsolatedWailsRuntime } from './bridge-runtime-source.test-support';

/** The draft's view of one anime, as the Editor sends it. */
const REQUEST = { animeId: 'anime-1', folder: 'D:/Anime/Frieren', totalEpisodes: 12, kind: 0 };

/**
 * Attaches fake Go bindings and lets the adapter's readiness poll see them.
 * @param app The fake `window.go.desktop.App` methods.
 */
async function attachBindings(app: Record<string, unknown>): Promise<void> {
  const { WAILS_BINDINGS_POLL_MS } = await import('../wails-bindings.helpers');
  window.go = { desktop: { App: app } } as never;
  await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);
}

describe('episode-duration runtime source', () => {
  useIsolatedWailsRuntime();

  it('reads the section for the draft and narrows unknown wire values', async () => {
    const { createEpisodeDurationRuntimeSource } = await import('../bridge-runtime-source/episode-duration-runtime-source.helpers');
    const getSection = vi.fn().mockResolvedValue({
      outcome: 'ok', folderStatus: 'found', beyondTotal: [13], tv: true,
      rows: [
        { episode: 1, durationMs: 1_440_000, minutes: 24, long: false, source: 'measured' },
        { episode: 2, durationMs: 0, minutes: 0, long: false, source: 'something-new' },
      ],
    });
    const pending = createEpisodeDurationRuntimeSource().getEpisodeDurationSection(REQUEST);

    await attachBindings({ GetEpisodeDurationSection: getSection });

    await expect(pending).resolves.toStrictEqual({
      outcome: 'ok', folderStatus: 'found', beyondTotal: [13], tv: true,
      rows: [
        { episode: 1, durationMs: 1_440_000, minutes: 24, long: false, source: 'measured' },
        { episode: 2, durationMs: 0, minutes: 0, long: false, source: 'not_measured' },
      ],
    });
    expect(getSection).toHaveBeenCalledWith(REQUEST);
  });

  it('keeps every row source and every review result the backend knows', async () => {
    const { createEpisodeDurationRuntimeSource } = await import('../bridge-runtime-source/episode-duration-runtime-source.helpers');
    const sources = ['measured', 'manual', 'manual_no_file', 'not_measured', 'not_measured_file_found'];
    const results = ['unchanged', 'update', 'add', 'manual_kept', 'skipped', 'unreadable', 'not_reached'];
    const getSection = vi.fn().mockResolvedValue({
      outcome: 'ok', folderStatus: 'found', beyondTotal: [], tv: true,
      rows: sources.map((source, index) => ({ episode: index + 1, durationMs: 0, minutes: 0, long: false, source })),
    });
    const reanalyze = vi.fn().mockResolvedValue({
      outcome: 'ok', status: 'ok', filesRecognized: results.length,
      rows: results.map((result, index) => ({ episode: index + 1, basename: 'e.mkv', currentMs: 0, currentMinutes: 0, currentSource: '', measuredMs: 0, measuredMinutes: 0, result })),
    });
    const source = createEpisodeDurationRuntimeSource();
    const section = source.getEpisodeDurationSection(REQUEST);
    const review = source.reanalyzeEpisodeDurations(REQUEST);

    await attachBindings({ GetEpisodeDurationSection: getSection, ReanalyzeEpisodeDurations: reanalyze });

    expect((await section).rows.map((row) => row.source)).toEqual(sources);
    expect((await review).rows.map((row) => row.result)).toEqual(results);
  });

  it('creates the source once and shares it', async () => {
    const { createEpisodeDurationRuntimeSource } = await import('../bridge-runtime-source/episode-duration-runtime-source.helpers');

    expect(createEpisodeDurationRuntimeSource()).toBe(createEpisodeDurationRuntimeSource());
  });

  it('keeps a missing folder status', async () => {
    const { createEpisodeDurationRuntimeSource } = await import('../bridge-runtime-source/episode-duration-runtime-source.helpers');
    const getSection = vi.fn().mockResolvedValue({ outcome: 'ok', folderStatus: 'missing', rows: [], beyondTotal: [], tv: true });
    const pending = createEpisodeDurationRuntimeSource().getEpisodeDurationSection(REQUEST);

    await attachBindings({ GetEpisodeDurationSection: getSection });

    await expect(pending).resolves.toEqual(expect.objectContaining({ folderStatus: 'missing' }));
  });

  it('turns an unknown section outcome or folder status into a failure the UI can show', async () => {
    const { createEpisodeDurationRuntimeSource } = await import('../bridge-runtime-source/episode-duration-runtime-source.helpers');
    const getSection = vi.fn().mockResolvedValue({ outcome: 'weird', message: 'boom', folderStatus: 'odd', rows: null, beyondTotal: null, tv: false });
    const pending = createEpisodeDurationRuntimeSource().getEpisodeDurationSection(REQUEST);

    await attachBindings({ GetEpisodeDurationSection: getSection });

    await expect(pending).resolves.toEqual({ outcome: 'error', message: 'boom', folderStatus: 'none', rows: [], beyondTotal: [], tv: false });
  });

  it('fails closed with an error section and an error review while the runtime is absent', async () => {
    const { createEpisodeDurationRuntimeSource } = await import('../bridge-runtime-source/episode-duration-runtime-source.helpers');
    const { WAILS_BINDINGS_TIMEOUT_MS } = await import('../wails-bindings.helpers');
    const source = createEpisodeDurationRuntimeSource();
    const section = source.getEpisodeDurationSection(REQUEST);
    const review = source.reanalyzeEpisodeDurations(REQUEST);
    const cancel = source.cancelEpisodeReanalysis();

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_TIMEOUT_MS + 100);

    await expect(section).resolves.toEqual(expect.objectContaining({ outcome: 'error', message: 'runtime unavailable', rows: [] }));
    await expect(review).resolves.toEqual(expect.objectContaining({ outcome: 'error', message: 'runtime unavailable', rows: [] }));
    await expect(cancel).resolves.toBeUndefined();
  });

  it('re-analyzes, keeps known results and statuses, and cancels through the binding', async () => {
    const { createEpisodeDurationRuntimeSource } = await import('../bridge-runtime-source/episode-duration-runtime-source.helpers');
    const reanalyze = vi.fn().mockResolvedValue({
      outcome: 'ok', status: 'interrupted', filesRecognized: 2,
      rows: [
        { episode: 4, basename: 'e04.mkv', currentMs: 1_380_000, currentMinutes: 23, currentSource: 'measured', measuredMs: 2_760_000, measuredMinutes: 46, result: 'update' },
        { episode: 5, basename: 'e05.mkv', currentMs: 0, currentMinutes: 0, currentSource: '', measuredMs: 0, measuredMinutes: 0, result: 'mystery', detail: 'x' },
      ],
    });
    const cancelBinding = vi.fn().mockResolvedValue(undefined);
    const source = createEpisodeDurationRuntimeSource();
    const pending = source.reanalyzeEpisodeDurations(REQUEST);
    const cancel = source.cancelEpisodeReanalysis();

    await attachBindings({ ReanalyzeEpisodeDurations: reanalyze, CancelEpisodeReanalysis: cancelBinding });

    const review = await pending;
    await cancel;
    expect(review.outcome).toBe('ok');
    expect(review.status).toBe('interrupted');
    expect(review.rows.map((row) => row.result)).toEqual(['update', 'skipped']);
    expect(review.rows[1]?.detail).toBe('x');
    expect(review).not.toHaveProperty('message');
    expect(review.rows[0]).not.toHaveProperty('detail');
    expect(reanalyze).toHaveBeenCalledWith(REQUEST);
    expect(cancelBinding).toHaveBeenCalledTimes(1);
  });

  it('narrows an unknown review outcome to an error and keeps busy', async () => {
    const { createEpisodeDurationRuntimeSource } = await import('../bridge-runtime-source/episode-duration-runtime-source.helpers');
    const reanalyze = vi.fn()
      .mockResolvedValueOnce({ outcome: 'busy', message: 'a re-analysis is already running', status: '', filesRecognized: 0, rows: null })
      .mockResolvedValueOnce({ outcome: 'later', status: 'ok', filesRecognized: 0, rows: [] });
    const source = createEpisodeDurationRuntimeSource();
    const first = source.reanalyzeEpisodeDurations(REQUEST);
    const second = source.reanalyzeEpisodeDurations(REQUEST);

    await attachBindings({ ReanalyzeEpisodeDurations: reanalyze });

    await expect(first).resolves.toEqual({ outcome: 'busy', message: 'a re-analysis is already running', status: 'ok', filesRecognized: 0, rows: [] });
    await expect(second).resolves.toEqual(expect.objectContaining({ outcome: 'error' }));
  });

  it('delivers re-analysis progress to every listener and stops after unsubscribe', async () => {
    let handler: ((progress: unknown) => void) | undefined;
    const eventsOnMultiple = vi.fn().mockImplementation((_name: string, callback: (progress: unknown) => void) => {
      handler = callback;
      return () => undefined;
    });
    window.runtime = { EventsOnMultiple: eventsOnMultiple } as never;
    const { createEpisodeDurationRuntimeSource } = await import('../bridge-runtime-source/episode-duration-runtime-source.helpers');
    const listener = vi.fn();
    const unsubscribe = createEpisodeDurationRuntimeSource().onEpisodeReanalysisProgress(listener);
    await vi.advanceTimersByTimeAsync(100);

    handler?.({ animeId: 'anime-1', index: 5, total: 12, episode: 5 });
    unsubscribe();
    handler?.({ animeId: 'anime-1', index: 6, total: 12, episode: 6 });

    expect(eventsOnMultiple).toHaveBeenCalledWith('episode.durations_reanalysis_progress', expect.any(Function), -1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ animeId: 'anime-1', index: 5, total: 12, episode: 5 });
  });
});

describe('bridge-runtime-source editor save with episodes', () => {
  useIsolatedWailsRuntime();

  it('sends the draft episode edits beside the patch, and none when the draft has none', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const save = vi.fn().mockResolvedValue({ animeId: 'anime-1', outcome: 'applied', message: 'saved', modifiedAt: 100 });
    const source = createBridgeRuntimeSource();
    const emptyPatch = { cover: { present: false, clear: false, type: '', path: '' } };
    const edits = [
      { episode: 4, durationMs: 2_760_000, source: 'manual' as const, clear: false },
      { episode: 5, durationMs: 0, source: 'manual' as const, clear: true },
    ];
    const withEpisodes = source.saveAnimeEditor({ animeId: 'anime-1', baseModifiedAt: 100, patch: emptyPatch as never, episodes: edits });
    const withoutEpisodes = source.saveAnimeEditor({ animeId: 'anime-1', baseModifiedAt: 100, patch: emptyPatch as never });

    await attachBindings({ SaveAnimeEditor: save });
    await withEpisodes;
    await withoutEpisodes;

    const [first] = save.mock.calls[0] as [Record<string, unknown>];
    const [second] = save.mock.calls[1] as [Record<string, unknown>];
    expect(first['episodes']).toEqual(edits);
    expect(second).not.toHaveProperty('episodes');
  });
});
