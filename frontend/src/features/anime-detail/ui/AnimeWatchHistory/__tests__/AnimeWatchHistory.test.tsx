import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WatchHistoryEntry } from '../../../../../shared/contracts/anime.types';
import type { AnimeWatchHistoryState } from '../anime-watch-history.types';
import { AnimeWatchHistory } from '../AnimeWatchHistory';
import * as useAnimeWatchHistoryModule from '../use-anime-watch-history';

/** Builds a minimal WatchHistoryEntry fixture, overriding only what a case needs. */
function entry(overrides: Partial<WatchHistoryEntry> = {}): WatchHistoryEntry {
  return {
    id: 1,
    animeId: 'anime-1',
    animeName: 'Frieren',
    episode: 12,
    cycle: 1,
    watchedAtMs: new Date(2026, 8, 12, 9, 5, 0).getTime(),
    source: 'desktop',
    ...overrides,
  };
}

/** Renders AnimeWatchHistory with useAnimeWatchHistory stubbed to the given state. */
function renderSection(overrides: Partial<AnimeWatchHistoryState>) {
  vi.spyOn(useAnimeWatchHistoryModule, 'useAnimeWatchHistory').mockReturnValue({
    entries: [],
    isLoading: false,
    hasMore: false,
    error: undefined,
    ...overrides,
  });

  return render(<AnimeWatchHistory animeId="anime-1" />);
}

describe('AnimeWatchHistory', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders one row per recorded episode, plus the truncated-page notice when more rows exist', () => {
    renderSection({ entries: [entry({ episode: 12 }), entry({ id: 2, episode: 11 })], hasMore: true });

    expect(screen.getByText('Episode 12')).toBeInTheDocument();
    expect(screen.getByText('Episode 11')).toBeInTheDocument();
    expect(screen.getByText('Showing the 50 most recent episodes. The full list is in History.')).toBeInTheDocument();
  });

  it('shows only the loading skeleton while unresolved, never real rows', () => {
    renderSection({ isLoading: true, entries: [entry({})] });

    expect(screen.getByRole('status', { name: 'Loading episode history...' })).toBeInTheDocument();
    expect(screen.queryByText('Episode 12')).not.toBeInTheDocument();
  });

  it('shows the empty state, not a blank section, when the anime has no recorded rows', () => {
    renderSection({ entries: [] });

    expect(screen.getByText('No episode history yet')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the surface error alert, never a skeleton or empty state, when the request fails', () => {
    renderSection({ entries: [], error: new Error('episode history service unavailable') });

    expect(screen.getByText('Episode history unavailable')).toBeInTheDocument();
    expect(screen.getByText('episode history service unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No episode history yet')).toBeNull();
  });
});
