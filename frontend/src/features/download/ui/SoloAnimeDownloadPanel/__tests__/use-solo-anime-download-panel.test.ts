import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source';
import type { DownloadRuntimeSource } from '../../../../../infrastructure/download-runtime-source';
import type { Anime } from '../../../../../shared/contracts/anime.types';
import { useSoloAnimeDownloadPanel } from '../use-solo-anime-download-panel';

const anime: Anime = {
  id: 'anime-1',
  name: 'Frieren',
  status: 2,
  episodesWatched: 12,
  totalEpisodes: 28,
  active: 1,
  days: [],
  genres: [],
  hasDownloadPage: true,
  hasFolder: true,
};

function createAnimeSource(items: readonly Anime[] = [anime]): BridgeRuntimeSource {
  return {
    getSQLiteStatus: vi.fn(),
    getEffectiveAddress: vi.fn(),
    getPairingToken: vi.fn(),
    getSyncingAnimeItems: vi.fn(),
    getAnimes: vi.fn().mockResolvedValue(items),
    getAnimeDetail: vi.fn().mockResolvedValue(null),
    getAnimeHistory: vi.fn(),
    triggerReconcile: vi.fn(),
    onPairingTokenConsumed: vi.fn().mockReturnValue(() => undefined),
  };
}

function createDownloadSource(overrides: Partial<DownloadRuntimeSource> = {}): DownloadRuntimeSource {
  return {
    getDownloadConfig: vi.fn(),
    getJDStatus: vi.fn(),
    setJDConfig: vi.fn(),
    getScheduleConfig: vi.fn(),
    setScheduleConfig: vi.fn(),
    setHosterPriority: vi.fn(),
    triggerDownloadCheck: vi.fn(),
    triggerAnimeDownload: vi.fn().mockResolvedValue('ok'),
    runMissedScheduleNow: vi.fn(),
    ignoreMissedSchedule: vi.fn(),
    listDownloadRuns: vi.fn(),
    subscribeRunEvents: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

describe('useSoloAnimeDownloadPanel', () => {
  it('loads anime options', async () => {
    const { result } = renderHook(() => useSoloAnimeDownloadPanel(createAnimeSource(), createDownloadSource()));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.options[0].name).toBe('Frieren');
  });

  it('triggers a solo download for the selected anime', async () => {
    const downloadSource = createDownloadSource();
    const { result } = renderHook(() => useSoloAnimeDownloadPanel(createAnimeSource(), downloadSource));
    let triggerPromise: Promise<void> | undefined;

    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      result.current.onSelectAnime('anime-1');
    });
    await waitFor(() => expect(result.current.selected?.id).toBe('anime-1'));
    expect(result.current.canTrigger).toBe(true);
    act(() => {
      triggerPromise = result.current.onTriggerDownload();
    });
    await triggerPromise;
    expect(downloadSource.triggerAnimeDownload).toHaveBeenCalledWith('anime-1');

  });

  it('sends the selected anime id when the backend later reports an error', async () => {
    const downloadSource = createDownloadSource({ triggerAnimeDownload: vi.fn().mockResolvedValue('boom') });
    const { result } = renderHook(() => useSoloAnimeDownloadPanel(createAnimeSource(), downloadSource));
    let triggerPromise: Promise<void> | undefined;

    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      result.current.onSelectAnime('anime-1');
    });
    await waitFor(() => expect(result.current.selected?.id).toBe('anime-1'));
    expect(result.current.canTrigger).toBe(true);
    act(() => {
      triggerPromise = result.current.onTriggerDownload();
    });
    await triggerPromise;

    expect(downloadSource.triggerAnimeDownload).toHaveBeenCalledWith('anime-1');
  });
});
