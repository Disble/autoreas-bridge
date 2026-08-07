import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DownloadRuntimeSource } from '../../../../../infrastructure/download-runtime-source/download-runtime-source.types';
import type { AnimeDownloadReadiness, DownloadReadinessSnapshot } from '../../../../../shared/contracts/download.types';
import { useSoloAnimeDownloadPanel } from '../use-solo-anime-download-panel';

const snapshot: DownloadReadinessSnapshot = {
  items: [
    { animeId: 'blocked', name: 'Blocked Anime', ready: false, reasons: ['destination_unresolved'], scheduledToday: false },
    { animeId: 'ready', name: 'Ready Anime', ready: true, reasons: [], scheduledToday: false },
  ],
  scheduledTotal: 0,
  scheduledReady: 0,
  scheduledBlocked: 0,
};

function createSnapshot(items: readonly AnimeDownloadReadiness[]): DownloadReadinessSnapshot {
  return { items, scheduledTotal: 0, scheduledReady: 0, scheduledBlocked: 0 };
}

function createDownloadSource(overrides: Partial<DownloadRuntimeSource> = {}): DownloadRuntimeSource {
  return {
    getDownloadConfig: vi.fn(),
    getJDStatus: vi.fn(),
    getJDMaxSimultaneousDownloads: vi.fn().mockResolvedValue(0),
    setJDConfig: vi.fn(),
    getScheduleConfig: vi.fn(),
    setScheduleConfig: vi.fn(),
    setHosterPriority: vi.fn(),
    setEpisodeRenameEnabled: vi.fn().mockResolvedValue('ok'),
    triggerDownloadCheck: vi.fn(),
    triggerAnimeDownload: vi.fn().mockResolvedValue('ok'),
    cancelDownloadRun: vi.fn().mockResolvedValue('ok'),
    runMissedScheduleNow: vi.fn(),
    ignoreMissedSchedule: vi.fn(),
    listDownloadRuns: vi.fn(),
    listDownloadReadiness: vi.fn().mockResolvedValue(snapshot),
    subscribeRunEvents: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

describe('useSoloAnimeDownloadPanel', () => {
  it('opens on the actionable side of the catalog', async () => {
    const source = createDownloadSource();
    const { result } = renderHook(() => useSoloAnimeDownloadPanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.filter).toBe('ready');
    expect(result.current.options.map((option) => option.name)).toEqual(['Ready Anime']);
    expect(result.current.counts).toEqual({ ready: 1, blocked: 1 });
  });

  it('loads blocked records too, reachable from the blocked tab', async () => {
    const source = createDownloadSource();
    const { result } = renderHook(() => useSoloAnimeDownloadPanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.onFilterChange('blocked'));

    expect(result.current.options.map((option) => option.name)).toEqual(['Blocked Anime']);
    expect(result.current.options[0]?.statusTag).toBe('No destination');
  });

  it('keeps a blocked selection inspectable and prevents runtime execution', async () => {
    const source = createDownloadSource();
    const { result } = renderHook(() => useSoloAnimeDownloadPanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.onFilterChange('blocked'));
    act(() => result.current.onSelectAnime('blocked'));
    await waitFor(() => expect(result.current.selected?.id).toBe('blocked'));

    expect(result.current.canTrigger).toBe(false);
    await act(async () => result.current.onTriggerDownload());
    expect(source.triggerAnimeDownload).not.toHaveBeenCalled();
  });

  it('does not drop the selection when the user switches tabs', async () => {
    const source = createDownloadSource();
    const { result } = renderHook(() => useSoloAnimeDownloadPanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.onSelectAnime('ready'));
    await waitFor(() => expect(result.current.selected?.id).toBe('ready'));

    act(() => result.current.onFilterChange('blocked'));

    expect(result.current.selected?.id).toBe('ready');
    expect(result.current.canTrigger).toBe(true);
  });

  it('enables and triggers a ready selection', async () => {
    const source = createDownloadSource();
    const { result } = renderHook(() => useSoloAnimeDownloadPanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.onSelectAnime('ready'));
    await waitFor(() => expect(result.current.selected?.id).toBe('ready'));

    expect(result.current.canTrigger).toBe(true);
    await act(async () => result.current.onTriggerDownload());
    expect(source.triggerAnimeDownload).toHaveBeenCalledWith('ready');
  });

  it('renders one batch of a large catalog instead of every row', async () => {
    const source = createDownloadSource({
      listDownloadReadiness: vi.fn().mockResolvedValue(createSnapshot(
        Array.from({ length: 300 }, (_, index) => ({
          animeId: `anime-${index}`,
          name: `Anime ${String(index).padStart(3, '0')}`,
          ready: true,
          reasons: [],
          scheduledToday: false,
        })),
      )),
    });
    const { result } = renderHook(() => useSoloAnimeDownloadPanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.counts.ready).toBe(300);
    expect(result.current.options).toHaveLength(20);
    expect(result.current.options[0]?.name).toBe('Anime 000');
  });

  it('tells the user when their search only matched the other tab', async () => {
    const source = createDownloadSource();
    const { result } = renderHook(() => useSoloAnimeDownloadPanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.onQueryChange('blocked'));

    expect(result.current.options).toHaveLength(0);
    expect(result.current.emptyMessage).toBe('No ready anime match "blocked" — 1 blocked match.');
  });

  it('surfaces query failure and retries the backend query', async () => {
    const source = createDownloadSource({
      listDownloadReadiness: vi.fn().mockRejectedValueOnce(new Error('readiness failed')).mockResolvedValue(snapshot),
    });
    const { result } = renderHook(() => useSoloAnimeDownloadPanel(source));

    await waitFor(() => expect(result.current.status).toBe('readiness-error'));
    expect(result.current.errorMessage).toBe('readiness failed');
    act(() => result.current.onRetry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(source.listDownloadReadiness).toHaveBeenCalledTimes(2);
  });

  it('keeps a download-start failure separate from readiness loading', async () => {
    const source = createDownloadSource({
      triggerAnimeDownload: vi.fn().mockRejectedValue(new Error('JDownloader is unavailable')),
    });
    const { result } = renderHook(() => useSoloAnimeDownloadPanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.onSelectAnime('ready'));
    await act(async () => result.current.onTriggerDownload());

    expect(result.current.status).toBe('trigger-error');
    expect(result.current.errorMessage).toBe('JDownloader is unavailable');
    expect(result.current.canTrigger).toBe(true);
  });
});
