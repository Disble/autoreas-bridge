import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnimeDetail } from '../../../../../shared/contracts/anime.types';
import type { DownloadRunView } from '../../../../../shared/contracts/download.types';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { BRIDGE_ANIME_SOURCE } from '../../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import type { RunHistoryStory } from '../run-history-panel.types';
import { useRunHistoryDetail } from '../use-run-history-detail';

/** A finished run that downloaded two episodes. */
const run: DownloadRunView = {
  runId: 'run-1',
  startedAtMs: 1_700_000_000_000,
  finishedAtMs: 1_700_000_100_000,
  trigger: 'manual',
  animesChecked: 2,
  episodesFound: 2,
  episodesDownloaded: 2,
  episodesFailed: 0,
  episodesDownloading: 0,
  skippedCount: 0,
  upToDateCount: 0,
  jdAvailable: true,
  status: 'ok',
};

/** A stored story whose two steps left their anime unnamed. */
const unnamedStory: RunHistoryStory = {
  truncated: false,
  steps: [
    { entityId: 'a1', eventType: 'download.episode_downloaded', level: 'info', metadataJson: '{"episode":4}' },
    { entityId: 'a2', eventType: 'download.episode_downloaded', level: 'info', metadataJson: '{"episode":5}' },
  ],
};

/**
 * Renders the detail hook with only the story port injected, so names and covers use their defaults.
 * @returns The hook result.
 */
function renderDetail() {
  const storySource = { getRunStory: vi.fn().mockResolvedValue(unnamedStory) };
  return renderHook(() => useRunHistoryDetail(run, { storySource }));
}

/**
 * The downloaded rows' names and their loading flags.
 * @param detail The hook's detail view model.
 * @returns One entry per row.
 */
function downloadedNames(detail: ReturnType<typeof useRunHistoryDetail>['detail']) {
  return detail?.groups.find((group) => group.id === 'downloaded')?.rows?.map(({ name, isNameLoading }) => ({ name, isNameLoading }));
}

describe('useRunHistoryDetail default anime ports', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names and covers the anime through the anime module, reading a not_found anime as unnamed', async () => {
    const getAnimeDetail = vi
      .spyOn(BRIDGE_ANIME_SOURCE, 'getAnimeDetail')
      .mockImplementation((id) => (id === 'a1' ? Promise.resolve({ name: 'Frieren' } as AnimeDetail) : Promise.reject(createBridgeError('not_found', `anime ${id} not found`))));
    const getAnimeCover = vi.spyOn(BRIDGE_ANIME_SOURCE, 'getAnimeCover').mockResolvedValue({ source: 'cover', dataUrl: 'data:image/png;base64,AA' });

    const { result } = renderDetail();

    await waitFor(() => expect(downloadedNames(result.current.detail)).toEqual([{ name: 'Frieren', isNameLoading: false }, { name: 'a2', isNameLoading: false }]));
    expect(getAnimeDetail.mock.calls).toEqual([['a1'], ['a2']]);
    await waitFor(() => expect(result.current.covers.get('a1')).toEqual({ status: 'cover', dataUrl: 'data:image/png;base64,AA' }));
    expect(getAnimeCover).toHaveBeenCalledWith('a2');
  });

  it('keeps the id as the name when the anime read fails, because a run row has no failure state for its name', async () => {
    vi.spyOn(BRIDGE_ANIME_SOURCE, 'getAnimeDetail').mockRejectedValue(createBridgeError('unavailable', 'anime is starting'));
    vi.spyOn(BRIDGE_ANIME_SOURCE, 'getAnimeCover').mockRejectedValue(createBridgeError('unavailable', 'anime is starting'));

    const { result } = renderDetail();

    await waitFor(() => expect(downloadedNames(result.current.detail)).toEqual([{ name: 'a1', isNameLoading: false }, { name: 'a2', isNameLoading: false }]));
    expect(result.current.covers.get('a1')).toBeUndefined();
  });
});
