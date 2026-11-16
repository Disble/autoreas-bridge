import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ModuleReadiness } from '../../../../../shared/contracts/readiness.types';
import type { EpisodeDurationRuntimeSource, EpisodeDurationSection } from '../../../../../shared/contracts/episode-durations.types';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { status } from '../../../../../shared/query/test-support/readiness-source.test-support';
import { EPISODE_DURATIONS_RELOAD_DELAY_MS } from '../episode-durations-section.constants';
import type { UseEpisodeDurationsLoadOptions } from '../episode-durations-section.types';
import { useEpisodeDurationsLoad } from '../use-episode-durations-load';

/** A found-folder TV section with one measured episode. */
const SECTION: EpisodeDurationSection = {
  folderStatus: 'found', beyondTotal: [], tv: true,
  rows: [{ episode: 1, durationMs: 1_440_000, minutes: 24, long: false, source: 'measured' }],
};

/**
 * Builds a fake episode-duration source.
 * @param getEpisodeDurationSection The section binding.
 * @returns The source.
 */
function createSource(getEpisodeDurationSection: EpisodeDurationRuntimeSource['getEpisodeDurationSection']): EpisodeDurationRuntimeSource {
  return { getEpisodeDurationSection, reanalyzeEpisodeDurations: vi.fn(), cancelEpisodeReanalysis: vi.fn(), saveEpisodeDurations: vi.fn(), onEpisodeReanalysisProgress: vi.fn(() => () => undefined) };
}

/**
 * Builds the saved-anime inputs of the card read, with no edits.
 * @param overrides Fields to replace.
 * @returns The options.
 */
function options(overrides: Partial<UseEpisodeDurationsLoadOptions> = {}): UseEpisodeDurationsLoadOptions {
  return { animeId: 'anime-1', folder: 'D:/Anime/Frieren', totalEpisodes: '12', kind: '0', edits: [], revision: 0, ...overrides };
}

/**
 * Renders the load hook under a query wrapper whose episodes module is in `episodes`.
 * @param source The fake source.
 * @param initial The first options.
 * @param episodes The episodes module's readiness.
 * @returns The rendered hook, its query client and the readiness `emit`.
 */
function renderLoad(source: EpisodeDurationRuntimeSource, initial = options(), episodes: ModuleReadiness = status('episodes', 'ready')) {
  const { client, wrapper, emit } = createModulesTestWrapper(episodes);
  const rendered = renderHook((props: UseEpisodeDurationsLoadOptions) => useEpisodeDurationsLoad(props, source), { initialProps: initial, wrapper });
  return { ...rendered, client, emit };
}

describe('useEpisodeDurationsLoad', () => {
  it('reads the section for the draft, showing loading with no rows until it resolves', async () => {
    const getSection = vi.fn().mockResolvedValue(SECTION);
    const { result } = renderLoad(createSource(getSection));

    expect(result.current.load.status).toBe('loading');
    expect(result.current.rows).toEqual([]);
    await waitFor(() => expect(result.current.load.status).toBe('ready'));
    expect(result.current.rows.map((row) => row.episode)).toEqual([1]);
    expect(getSection).toHaveBeenCalledTimes(1);
    expect(getSection).toHaveBeenCalledWith({ animeId: 'anime-1', folder: 'D:/Anime/Frieren', totalEpisodes: 12, kind: 0 });
  });

  it('reads nothing while no record is loaded, and starts no query', async () => {
    const getSection = vi.fn().mockResolvedValue(SECTION);
    const { result, client } = renderLoad(createSource(getSection), options({ animeId: undefined }));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current.load.status).toBe('idle');
    expect(result.current.request).toBeUndefined();
    expect(getSection).not.toHaveBeenCalled();
    // A disabled query never runs: it stays pending, with no failure for a missing record.
    expect(client.getQueryCache().getAll().map((query) => query.state.status)).toEqual(['pending']);
  });

  it('stays loading, without a read, while the episodes module starts, and reads once it is ready', async () => {
    const getSection = vi.fn().mockResolvedValue(SECTION);
    const { result, emit } = renderLoad(createSource(getSection), options(), status('episodes', 'starting'));

    // Past the reload delay, so the gated query is waiting on the module when it turns ready.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, EPISODE_DURATIONS_RELOAD_DELAY_MS + 50)); });
    expect(result.current.load.status).toBe('loading');
    expect(result.current.rows).toEqual([]);
    expect(getSection).not.toHaveBeenCalled();

    act(() => emit(status('episodes', 'ready')));

    await waitFor(() => expect(result.current.load.status).toBe('ready'));
    expect(getSection).toHaveBeenCalledTimes(1);
  });

  it('fails with the reason, without a read, once the episodes module failed', async () => {
    const getSection = vi.fn().mockResolvedValue(SECTION);
    const { result } = renderLoad(createSource(getSection), options(), status('episodes', 'failed', 'episodes: episode service was not wired'));

    await waitFor(() => expect(result.current.load).toEqual({ status: 'failed', message: 'episodes: episode service was not wired' }));
    expect(getSection).not.toHaveBeenCalled();
    expect(result.current.rows).toEqual([]);
  });

  it('follows a saved folder change, never showing the previous folder rows, and drops the stale answer', async () => {
    let resolveFirst: (section: EpisodeDurationSection) => void = () => undefined;
    const getSection = vi.fn()
      .mockImplementationOnce(() => new Promise<EpisodeDurationSection>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValue({ ...SECTION, folderStatus: 'missing' });
    const { result, rerender } = renderLoad(createSource(getSection));
    await waitFor(() => expect(getSection).toHaveBeenCalledTimes(1));

    rerender(options({ folder: 'D:/Anime/Fr' }));
    await waitFor(() => expect(result.current.load.status).toBe('ready'));
    resolveFirst(SECTION);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getSection).toHaveBeenLastCalledWith(expect.objectContaining({ folder: 'D:/Anime/Fr' }));
    expect(result.current.load).toEqual({ status: 'ready', section: expect.objectContaining({ folderStatus: 'missing' }) });
  });

  it('shows loading, not the previous anime rows, while another anime reads', async () => {
    let resolveSecond: (section: EpisodeDurationSection) => void = () => undefined;
    const getSection = vi.fn()
      .mockResolvedValueOnce(SECTION)
      .mockImplementationOnce(() => new Promise<EpisodeDurationSection>((resolve) => { resolveSecond = resolve; }));
    const { result, rerender } = renderLoad(createSource(getSection));
    await waitFor(() => expect(result.current.load.status).toBe('ready'));

    rerender(options({ animeId: 'anime-2' }));

    await waitFor(() => expect(getSection).toHaveBeenCalledTimes(2));
    expect(result.current.load.status).toBe('loading');
    expect(result.current.rows).toEqual([]);
    act(() => resolveSecond({ ...SECTION, rows: [] }));
    await waitFor(() => expect(result.current.load).toEqual({ status: 'ready', section: expect.objectContaining({ rows: [] }) }));
  });

  it('reads the disk once for a burst of record reloads, with the last request, and shows loading meanwhile', async () => {
    vi.useFakeTimers();
    try {
      const getSection = vi.fn().mockResolvedValue(SECTION);
      const { result, rerender } = renderLoad(createSource(getSection), options({ folder: 'D:/Anime/A' }));
      /**
       * Advances the fake clock inside act, so timers, the query and React settle.
       * @param ms Milliseconds to advance.
       */
      const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

      await advance(100);
      rerender(options({ folder: 'D:/Anime/B' }));
      await advance(100);
      rerender(options({ folder: 'D:/Anime/C', totalEpisodes: '24' }));
      await advance(EPISODE_DURATIONS_RELOAD_DELAY_MS - 1);
      expect(getSection).not.toHaveBeenCalled();
      expect(result.current.load.status).toBe('loading');

      await advance(1);
      await advance(0);
      expect(getSection).toHaveBeenCalledTimes(1);
      expect(getSection).toHaveBeenCalledWith({ animeId: 'anime-1', folder: 'D:/Anime/C', totalEpisodes: 24, kind: 0 });
      expect(result.current.load.status).toBe('ready');

      rerender(options({ folder: 'D:/Anime/C', totalEpisodes: '24', revision: 1 }));
      expect(result.current.load.status).toBe('loading');
      expect(result.current.rows).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reloads after a save bumps the revision', async () => {
    const getSection = vi.fn().mockResolvedValue(SECTION);
    const { result, rerender } = renderLoad(createSource(getSection));
    await waitFor(() => expect(result.current.load.status).toBe('ready'));

    rerender(options({ revision: 1 }));

    await waitFor(() => expect(getSection).toHaveBeenCalledTimes(2));
  });

  it('fails with the rejection message and never keeps rows', async () => {
    const { result } = renderLoad(createSource(vi.fn().mockRejectedValue(createBridgeError('internal', 'read episode durations: disk gone'))));

    await waitFor(() => expect(result.current.load).toEqual({ status: 'failed', message: 'read episode durations: disk gone' }));
    expect(result.current.rows).toEqual([]);
  });

  it('applies the draft edits to the rows it serves', async () => {
    const edit = { episode: 2, durationMs: 1_500_000, source: 'manual' as const, clear: false };
    const { result } = renderLoad(createSource(vi.fn().mockResolvedValue(SECTION)), options({ edits: [edit] }));

    await waitFor(() => expect(result.current.load.status).toBe('ready'));
    expect(result.current.rows.map((row) => [row.episode, row.isUnsaved])).toEqual([[1, false], [2, true]]);
  });
});
