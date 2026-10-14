import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EpisodeDurationRuntimeSource, EpisodeDurationSection } from '../../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';
import type { UseEpisodeDurationsSectionOptions } from '../episode-durations-section.types';
import { useEpisodeDurationsLoad } from '../use-episode-durations-load';

/** A found-folder TV section with one measured episode. */
const SECTION: EpisodeDurationSection = {
  outcome: 'ok', folderStatus: 'found', beyondTotal: [], tv: true,
  rows: [{ episode: 1, durationMs: 1_440_000, minutes: 24, long: false, source: 'measured' }],
};

/**
 * Builds a fake episode-duration source.
 * @param getEpisodeDurationSection The section binding.
 * @returns The source.
 */
function createSource(getEpisodeDurationSection: EpisodeDurationRuntimeSource['getEpisodeDurationSection']): EpisodeDurationRuntimeSource {
  return { getEpisodeDurationSection, reanalyzeEpisodeDurations: vi.fn(), cancelEpisodeReanalysis: vi.fn(), onEpisodeReanalysisProgress: vi.fn(() => () => undefined) };
}

/**
 * Builds the draft inputs of the section.
 * @param overrides Fields to replace.
 * @returns The options.
 */
function options(overrides: Partial<UseEpisodeDurationsSectionOptions> = {}): UseEpisodeDurationsSectionOptions {
  return { animeId: 'anime-1', folder: 'D:/Anime/Frieren', totalEpisodes: '12', kind: '0', edits: [], revision: 0, onEditsChange: vi.fn(), ...overrides };
}

describe('useEpisodeDurationsLoad', () => {
  it('reads the section for the draft, showing loading with no rows until it resolves', async () => {
    const getSection = vi.fn().mockResolvedValue(SECTION);
    const source = createSource(getSection);
    const { result } = renderHook(() => useEpisodeDurationsLoad(options(), source));

    expect(result.current.load.status).toBe('loading');
    await waitFor(() => expect(result.current.load.status).toBe('ready'));
    expect(result.current.rows.map((row) => row.episode)).toEqual([1]);
    expect(getSection).toHaveBeenCalledTimes(1);
    expect(getSection).toHaveBeenCalledWith({ animeId: 'anime-1', folder: 'D:/Anime/Frieren', totalEpisodes: 12, kind: 0 });
  });

  it('reads nothing while no record is loaded', async () => {
    const getSection = vi.fn().mockResolvedValue(SECTION);
    const source = createSource(getSection);
    const { result } = renderHook(() => useEpisodeDurationsLoad(options({ animeId: undefined }), source));

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(result.current.load.status).toBe('idle');
    expect(result.current.request).toBeUndefined();
    expect(getSection).not.toHaveBeenCalled();
  });

  it('follows an unsaved folder edit with one read once typing settles, and drops the stale answer', async () => {
    let resolveFirst: (section: EpisodeDurationSection) => void = () => undefined;
    const getSection = vi.fn()
      .mockImplementationOnce(() => new Promise<EpisodeDurationSection>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValue({ ...SECTION, folderStatus: 'missing' });
    const source = createSource(getSection);
    const { result, rerender } = renderHook((props: UseEpisodeDurationsSectionOptions) => useEpisodeDurationsLoad(props, source), { initialProps: options() });
    await waitFor(() => expect(getSection).toHaveBeenCalledTimes(1));

    rerender(options({ folder: 'D:/Anime/F' }));
    rerender(options({ folder: 'D:/Anime/Fr' }));
    await waitFor(() => expect(result.current.load.status).toBe('ready'));
    resolveFirst(SECTION);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getSection).toHaveBeenCalledTimes(2);
    expect(getSection).toHaveBeenLastCalledWith(expect.objectContaining({ folder: 'D:/Anime/Fr' }));
    expect(result.current.load).toEqual({ status: 'ready', section: expect.objectContaining({ folderStatus: 'missing' }) });
  });

  it('drops the failure of a stale read', async () => {
    let rejectFirst: (error: Error) => void = () => undefined;
    const getSection = vi.fn()
      .mockImplementationOnce(() => new Promise<EpisodeDurationSection>((_resolve, reject) => { rejectFirst = reject; }))
      .mockResolvedValue(SECTION);
    const source = createSource(getSection);
    const { result, rerender } = renderHook((props: UseEpisodeDurationsSectionOptions) => useEpisodeDurationsLoad(props, source), { initialProps: options() });
    await waitFor(() => expect(getSection).toHaveBeenCalledTimes(1));

    rerender(options({ folder: 'D:/Anime/Fr' }));
    await waitFor(() => expect(result.current.load.status).toBe('ready'));
    rejectFirst(new Error('stale'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current.load.status).toBe('ready');
  });

  it('reloads after a save bumps the revision', async () => {
    const getSection = vi.fn().mockResolvedValue(SECTION);
    const source = createSource(getSection);
    const { result, rerender } = renderHook((props: UseEpisodeDurationsSectionOptions) => useEpisodeDurationsLoad(props, source), { initialProps: options() });
    await waitFor(() => expect(result.current.load.status).toBe('ready'));

    rerender(options({ revision: 1 }));

    await waitFor(() => expect(getSection).toHaveBeenCalledTimes(2));
  });

  it('fails with the backend message, or the thrown error, and never keeps rows', async () => {
    const failedSource = createSource(vi.fn().mockResolvedValue({ ...SECTION, outcome: 'error', message: 'disk gone' }));
    const thrownSource = createSource(vi.fn().mockRejectedValue(new Error('binding exploded')));
    const failed = renderHook(() => useEpisodeDurationsLoad(options(), failedSource));
    const thrown = renderHook(() => useEpisodeDurationsLoad(options(), thrownSource));

    await waitFor(() => expect(failed.result.current.load).toEqual({ status: 'failed', message: 'disk gone' }));
    await waitFor(() => expect(thrown.result.current.load).toEqual({ status: 'failed', message: 'binding exploded' }));
    expect(failed.result.current.rows).toEqual([]);
  });

  it('applies the draft edits to the rows it serves', async () => {
    const edit = { episode: 2, durationMs: 1_500_000, source: 'manual' as const, clear: false };
    const source = createSource(vi.fn().mockResolvedValue(SECTION));
    const { result } = renderHook(() => useEpisodeDurationsLoad(options({ edits: [edit] }), source));

    await waitFor(() => expect(result.current.load.status).toBe('ready'));
    expect(result.current.rows.map((row) => [row.episode, row.isUnsaved])).toEqual([[1, false], [2, true]]);
  });
});
