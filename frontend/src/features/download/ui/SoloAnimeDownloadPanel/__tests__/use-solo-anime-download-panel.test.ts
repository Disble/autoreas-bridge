import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDownloadsSourceFake, createDownloadsWrapper } from '../../../../../shared/hooks/use-missed-schedule-notice/__tests__/downloads.test-support';
import type { AnimeDownloadReadiness, DownloadReadinessSnapshot, DownloadsSource } from '../../../../../shared/contracts/download.types';
import { useSoloAnimeDownloadPanel } from '../use-solo-anime-download-panel';

/** A readiness snapshot with nothing in it, the starting point most cases narrow from. */
const snapshot: DownloadReadinessSnapshot = {
  items: [
    { animeId: 'blocked', name: 'Blocked Anime', ready: false, reasons: ['destination_unresolved'], scheduledToday: false },
    { animeId: 'ready', name: 'Ready Anime', ready: true, reasons: [], scheduledToday: false },
  ],
  scheduledTotal: 0,
  scheduledReady: 0,
  scheduledBlocked: 0,
};

/** Wraps readiness items into the snapshot envelope the binding returns. */
function createSnapshot(items: readonly AnimeDownloadReadiness[]): DownloadReadinessSnapshot {
  return { items, scheduledTotal: 0, scheduledReady: 0, scheduledBlocked: 0 };
}

/**
 * Builds a fully stubbed downloads port, overridable per case.
 * @param overrides The calls a case replaces.
 * @returns The port.
 */
function createSource(overrides: Partial<DownloadsSource> = {}): DownloadsSource {
  return createDownloadsSourceFake({
    listDownloadReadiness: vi.fn().mockResolvedValue(snapshot),
    ...overrides,
  });
}

describe('useSoloAnimeDownloadPanel', () => {
  it('opens on the actionable side of the catalog', async () => {
    const source = createSource();
    const { result } = renderHook(() => useSoloAnimeDownloadPanel(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.filter).toBe('ready');
    expect(result.current.options.map((option) => option.name)).toEqual(['Ready Anime']);
    expect(result.current.counts).toEqual({ ready: 1, blocked: 1 });
  });

  it('loads blocked records too, reachable from the blocked tab', async () => {
    const source = createSource();
    const { result } = renderHook(() => useSoloAnimeDownloadPanel(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.onFilterChange('blocked'));

    expect(result.current.options.map((option) => option.name)).toEqual(['Blocked Anime']);
    expect(result.current.options[0]?.statusTag).toBe('No destination');
  });

  it('keeps a blocked selection inspectable and prevents runtime execution', async () => {
    const source = createSource();
    const { result } = renderHook(() => useSoloAnimeDownloadPanel(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.onFilterChange('blocked'));
    act(() => result.current.onSelectAnime('blocked'));
    await waitFor(() => expect(result.current.selected?.id).toBe('blocked'));

    expect(result.current.canTrigger).toBe(false);
    await act(async () => result.current.onTriggerDownload());
    expect(source.triggerAnimeDownload).not.toHaveBeenCalled();
  });

  it('does not drop the selection when the user switches tabs', async () => {
    const source = createSource();
    const { result } = renderHook(() => useSoloAnimeDownloadPanel(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.onSelectAnime('ready'));
    await waitFor(() => expect(result.current.selected?.id).toBe('ready'));

    act(() => result.current.onFilterChange('blocked'));

    expect(result.current.selected?.id).toBe('ready');
    expect(result.current.canTrigger).toBe(true);
  });

  it('enables and triggers a ready selection', async () => {
    const source = createSource();
    const { result } = renderHook(() => useSoloAnimeDownloadPanel(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.onSelectAnime('ready'));
    await waitFor(() => expect(result.current.selected?.id).toBe('ready'));

    expect(result.current.canTrigger).toBe(true);
    await act(async () => result.current.onTriggerDownload());
    expect(source.triggerAnimeDownload).toHaveBeenCalledWith('ready');
  });

  it('renders one batch of a large catalog instead of every row', async () => {
    const source = createSource({
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
    const { result } = renderHook(() => useSoloAnimeDownloadPanel(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.counts.ready).toBe(300);
    expect(result.current.options).toHaveLength(20);
    expect(result.current.options[0]?.name).toBe('Anime 000');
  });

  it('tells the user when their search only matched the other tab', async () => {
    const source = createSource();
    const { result } = renderHook(() => useSoloAnimeDownloadPanel(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.onQueryChange('blocked'));

    expect(result.current.options).toHaveLength(0);
    expect(result.current.emptyMessage).toBe('No ready anime match "blocked" — 1 blocked match.');
  });

  it('surfaces query failure and retries the backend query', async () => {
    const source = createSource({
      listDownloadReadiness: vi.fn().mockRejectedValueOnce(new Error('readiness failed')).mockResolvedValue(snapshot),
    });
    const { result } = renderHook(() => useSoloAnimeDownloadPanel(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('readiness-error'));
    expect(result.current.errorMessage).toBe('readiness failed');
    act(() => result.current.onRetry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(source.listDownloadReadiness).toHaveBeenCalledTimes(2);
  });

  it('keeps a download-start failure separate from readiness loading', async () => {
    const source = createSource({
      triggerAnimeDownload: vi.fn().mockRejectedValue(new Error('JDownloader is unavailable')),
    });
    const { result } = renderHook(() => useSoloAnimeDownloadPanel(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.onSelectAnime('ready'));
    await act(async () => result.current.onTriggerDownload());

    expect(result.current.status).toBe('trigger-error');
    expect(result.current.errorMessage).toBe('JDownloader is unavailable');
    expect(result.current.canTrigger).toBe(true);
  });
});

describe('useSoloAnimeDownloadPanel trigger refusals', () => {
  it('reads the concurrent-run refusal as already in progress, not as an error', async () => {
    const source = createSource({
      triggerAnimeDownload: vi.fn().mockRejectedValue(new Error('schedule: a download run is already in progress')),
    });
    const { result } = renderHook(() => useSoloAnimeDownloadPanel(source), { wrapper: createDownloadsWrapper().wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.onSelectAnime('ready'));
    await act(async () => result.current.onTriggerDownload());

    expect(result.current.status).toBe('already-in-progress');
    expect(result.current.errorMessage).toBeUndefined();
  });
});
