import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WatchHistoryEntry, WatchHistoryPage } from '../../../../../shared/contracts/anime.types';

/** Mirrors the backend's default keyset page size (`defaultPageLimit`, `internal/watchhistory/store_page.go`). */
const HISTORY_PAGE_SIZE = 50;

/** Fake `bridgeRuntimeSource` serving one incrementing keyset page per call, hoisted for the module mock below. */
const { mockSource } = vi.hoisted(() => {
  /** Builds one fixture watch-history entry at the given index, strictly older as the index grows. */
  function buildEntry(index: number): WatchHistoryEntry {
    return {
      id: index,
      animeId: `anime-${index}`,
      animeName: `Anime ${index}`,
      episode: 1,
      cycle: 1,
      watchedAtMs: Date.UTC(2026, 8, 12, 12, 0) - index * 1000,
      source: 'desktop',
    };
  }
  /** Builds one keyset page of `HISTORY_PAGE_SIZE` rows starting at `offset`, always reporting a next page. */
  function buildPage(offset: number): WatchHistoryPage {
    return {
      items: Array.from({ length: HISTORY_PAGE_SIZE }, (_unused, index) => buildEntry(offset + index)),
      nextCursor: `cursor-${offset + HISTORY_PAGE_SIZE}`,
      status: 'ok',
    };
  }
  let pagesServed = 0;
  return {
    mockSource: {
      getWatchHistoryPage: vi.fn(() => {
        const result = buildPage(pagesServed * HISTORY_PAGE_SIZE);
        pagesServed += 1;
        return Promise.resolve(result);
      }),
    },
  };
});

vi.mock('../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers', () => ({
  bridgeRuntimeSource: mockSource,
}));

import { HistoryTimeline } from '../HistoryTimeline';

afterEach(cleanup);

/** Counts rendered watch-history rows, each a drill-down `Button`. */
function countRows() {
  return screen.getAllByRole('button').length;
}

describe('HistoryTimeline progressive keyset paging (D5a)', () => {
  it('renders exactly the first keyset page, then grows by one further page on near-bottom scroll', async () => {
    render(
      <MemoryRouter>
        <HistoryTimeline />
      </MemoryRouter>,
    );

    await waitFor(() => expect(countRows()).toBe(HISTORY_PAGE_SIZE));

    fireEvent.scroll(screen.getByTestId('history-timeline-scroll'));

    await waitFor(() => expect(countRows()).toBe(HISTORY_PAGE_SIZE * 2));

    // Still bounded — the second scroll appended exactly one further page, never the whole log.
    expect(countRows()).toBe(HISTORY_PAGE_SIZE * 2);
  });
});
