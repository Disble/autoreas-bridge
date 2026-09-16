import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WatchHistoryEntry, WatchHistoryPage } from '../../../../../shared/contracts/anime.types';

/** Mirrors the backend's default keyset page size (`defaultPageLimit`, `internal/watchhistory/store_page.go`). */
const EPISODE_PAGE_SIZE = 50;

/** Fake `bridgeRuntimeSource` serving one incrementing keyset page per call, hoisted for the module mock below. */
const { mockSource } = vi.hoisted(() => {
  /** Builds one fixture watch-history entry at the given index, strictly older as the index grows. */
  function buildEntry(index: number): WatchHistoryEntry {
    return {
      id: index,
      animeId: 'anime-1',
      animeName: 'Frieren',
      episode: EPISODE_PAGE_SIZE * 2 - index,
      cycle: 1,
      watchedAtMs: Date.UTC(2026, 8, 12, 12, 0) - index * 1000,
      source: 'desktop',
    };
  }
  /** Builds one keyset page of `EPISODE_PAGE_SIZE` rows starting at `offset`, always reporting a next page. */
  function buildPage(offset: number): WatchHistoryPage {
    return {
      items: Array.from({ length: EPISODE_PAGE_SIZE }, (_unused, index) => buildEntry(offset + index)),
      nextCursor: `cursor-${offset + EPISODE_PAGE_SIZE}`,
      status: 'ok',
    };
  }
  let pagesServed = 0;
  return {
    mockSource: {
      getAnimeWatchHistoryPage: vi.fn(() => {
        const result = buildPage(pagesServed * EPISODE_PAGE_SIZE);
        pagesServed += 1;
        return Promise.resolve(result);
      }),
    },
  };
});

vi.mock('../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers', () => ({
  bridgeRuntimeSource: mockSource,
}));

import { AnimeWatchEpisodeList } from '../AnimeWatchEpisodeList';

afterEach(cleanup);

/** Counts rendered episode rows in the episode list. */
function countRows() {
  return screen.getAllByTestId('anime-watch-episode-row').length;
}

describe('AnimeWatchEpisodeList progressive keyset paging', () => {
  it('renders exactly the first keyset page, then grows by one further page on near-bottom scroll', async () => {
    render(<AnimeWatchEpisodeList animeId="anime-1" />);

    await waitFor(() => expect(countRows()).toBe(EPISODE_PAGE_SIZE));

    fireEvent.scroll(screen.getByTestId('anime-watch-episode-list-scroll'));

    await waitFor(() => expect(countRows()).toBe(EPISODE_PAGE_SIZE * 2));

    // Still bounded — the second scroll appended exactly one further page, never the whole log.
    expect(countRows()).toBe(EPISODE_PAGE_SIZE * 2);
  });
});
