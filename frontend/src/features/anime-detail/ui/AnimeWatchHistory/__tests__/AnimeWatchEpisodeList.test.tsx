import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WatchHistoryEntry } from '../../../../../shared/contracts/anime.types';
import { AnimeWatchEpisodeList } from '../AnimeWatchEpisodeList';
import type { AnimeWatchEpisodesState } from '../anime-watch-history.types';
import * as useAnimeWatchEpisodesModule from '../use-anime-watch-episodes';

/** Builds a minimal WatchHistoryEntry fixture, overriding only what a case needs. */
function entry(overrides: Partial<WatchHistoryEntry> = {}): WatchHistoryEntry {
  return {
    id: 1,
    animeId: 'anime-1',
    animeName: 'Frieren',
    episode: 12,
    cycle: 2,
    watchedAtMs: new Date(2026, 8, 11, 20, 3, 0).getTime(),
    source: 'desktop',
    ...overrides,
  };
}

/** Renders AnimeWatchEpisodeList with useAnimeWatchEpisodes stubbed to the given state. */
function renderList(cycle: number | undefined, overrides: Partial<AnimeWatchEpisodesState>) {
  const spy = vi.spyOn(useAnimeWatchEpisodesModule, 'useAnimeWatchEpisodes').mockReturnValue({
    entries: [],
    isLoading: false,
    hasMore: false,
    error: undefined,
    fetchNextPage: vi.fn(),
    onScroll: vi.fn(),
    ...overrides,
  });

  render(<AnimeWatchEpisodeList animeId="anime-1" cycle={cycle} />);

  return spy;
}

describe('AnimeWatchEpisodeList', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders one row per recorded episode with its date and time together, plus a Watch chip when scoped to a cycle', () => {
    renderList(2, { entries: [entry({ episode: 12 }), entry({ id: 2, episode: 11 })] });

    expect(screen.getByText('Episode 12')).toBeInTheDocument();
    expect(screen.getByText('Episode 11')).toBeInTheDocument();
    expect(screen.getAllByText('Fri, Sep 11 · 20:03')).toHaveLength(2);
    expect(screen.getAllByText('Watch 2')).toHaveLength(2);
  });

  it('names each row’s own stored cycle in the All-episodes case, when no cycle is passed', () => {
    renderList(undefined, { entries: [entry({ cycle: 1 }), entry({ id: 2, episode: 11, cycle: 2 })] });

    expect(screen.getByText('Episode 12')).toBeInTheDocument();
    expect(screen.getByText('Episode 11')).toBeInTheDocument();
    expect(screen.getByText('Watch 1')).toBeInTheDocument();
    expect(screen.getByText('Watch 2')).toBeInTheDocument();
  });

  it('forwards the cycle scope to the episodes hook', () => {
    const spy = renderList(2, { entries: [] });

    expect(spy).toHaveBeenCalledWith('anime-1', 2, true);
  });

  it('never renders the truncated-page notice, since the list pages progressively instead', () => {
    renderList(undefined, { entries: [entry({})], hasMore: true });

    expect(screen.queryByText('Showing the 50 most recent episodes. The full list is in History.')).toBeNull();
  });

  it('shows only the loading skeleton while unresolved, never real rows', () => {
    renderList(undefined, { isLoading: true, entries: [entry({})] });

    expect(screen.getByRole('status', { name: 'Loading episode history...' })).toBeInTheDocument();
    expect(screen.queryByText('Episode 12')).not.toBeInTheDocument();
  });

  it('shows the empty state, not a blank list, when the anime has no recorded rows', () => {
    renderList(undefined, { entries: [] });

    expect(screen.getByText('No episode history yet')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the surface error alert, never a skeleton or empty state, when the request fails', () => {
    renderList(undefined, { entries: [], error: new Error('episode history service unavailable') });

    expect(screen.getByText('Episode history unavailable')).toBeInTheDocument();
    expect(screen.getByText('episode history service unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No episode history yet')).toBeNull();
  });
});
