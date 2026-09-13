import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnimeDetail, WatchHistoryEntry } from '../../../../../shared/contracts/anime.types';
import type { AnimeWatchEpisodesState } from '../anime-watch-history.types';
import { AnimeWatchHistory } from '../AnimeWatchHistory';
import * as useAnimeWatchEpisodesModule from '../use-anime-watch-episodes';

/** Builds a minimal WatchHistoryEntry fixture, overriding only what a case needs. */
function entry(overrides: Partial<WatchHistoryEntry> = {}): WatchHistoryEntry {
  return {
    id: 1,
    animeId: 'anime-1',
    animeName: 'Frieren',
    episode: 12,
    cycle: 2,
    watchedAtMs: new Date(2026, 8, 12, 9, 5, 0).getTime(),
    source: 'desktop',
    ...overrides,
  };
}

/**
 * Detail DTO with one finished past watch and a live in-progress watch, all
 * post-log so U13 headings render without the pre-log summary U14 owns.
 */
function detailFixture(): AnimeDetail {
  return {
    id: 'anime-1',
    name: 'Frieren',
    status: 0,
    episodesWatched: 12,
    totalEpisodes: 24,
    active: 1,
    days: [],
    genres: ['Adventure'],
    firstCycle: 1,
    createdAt: new Date(2026, 6, 10).getTime(),
    lastWatchedAt: new Date(2026, 8, 12, 9, 5).getTime(),
    modified_at: new Date(2026, 8, 12).getTime(),
    repetitions: [
      {
        numRepetitions: 1,
        episodesWatched: 24,
        status: 1,
        createdAt: new Date(2026, 6, 10).getTime(),
        deletedAt: new Date(2026, 7, 1).getTime(),
      },
    ],
  };
}

/** Idle hook state every stubbed call starts from. */
function idleState(overrides: Partial<AnimeWatchEpisodesState> = {}): AnimeWatchEpisodesState {
  return {
    entries: [],
    isLoading: false,
    hasMore: false,
    error: undefined,
    fetchNextPage: vi.fn(),
    onScroll: vi.fn(),
    ...overrides,
  };
}

/** Recorded hook calls, asserting each episode list fetched its own cycle. */
interface EpisodeHookCall {
  readonly animeId: string;
  readonly cycle: number | undefined;
  readonly enabled: boolean | undefined;
}

/**
 * Stubs the episode hook per cycle like the real hook behaves across
 * expand/collapse: an enabled list serves its rows, a disabled one keeps
 * whatever it last served (rowless when never enabled). The live watch
 * (cycle 2) serves episode 12, the All-episodes tab (cycle 0) serves episode
 * 11, the past watch (cycle 1) stays rowless so cases can distinguish panels.
 */
function stubEpisodesByCycle(calls: EpisodeHookCall[]): void {
  const served = new Map<number | undefined, WatchHistoryEntry[]>();
  vi.spyOn(useAnimeWatchEpisodesModule, 'useAnimeWatchEpisodes').mockImplementation(
    (animeId: string, cycle?: number, enabled?: boolean) => {
      calls.push({ animeId, cycle, enabled });

      if (enabled === true) {
        const rows = cycle === 1 ? [] : [entry({ episode: cycle === 2 ? 12 : 11, cycle: cycle === 2 ? 2 : 1 })];
        served.set(cycle, rows);

        return idleState({ entries: rows });
      }

      return idleState({ entries: served.get(cycle) ?? [] });
    },
  );
}

/** Renders the section against the detail fixture with episodes stubbed per cycle. */
function renderSection(calls: EpisodeHookCall[]) {
  stubEpisodesByCycle(calls);

  return render(<AnimeWatchHistory animeId="anime-1" detail={detailFixture()} />);
}

describe('AnimeWatchHistory', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the By-watch tab by default with the live watch first and its Current chip', () => {
    const calls: EpisodeHookCall[] = [];
    renderSection(calls);

    expect(screen.getByRole('tab', { name: 'By watch' })).toHaveAttribute('aria-selected', 'true');

    const liveHeading = screen.getByRole('button', { name: /Watch 2/ });
    const pastHeading = screen.getByRole('button', { name: /Watch 1/ });
    expect(liveHeading.compareDocumentPosition(pastHeading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(liveHeading.textContent).toMatch(/Current/);
    expect(pastHeading.textContent).not.toMatch(/Current/);
  });

  it('shows status, episode count, and progress in every watch heading', () => {
    const calls: EpisodeHookCall[] = [];
    renderSection(calls);

    expect(screen.getByRole('button', { name: /Watch 2/ }).textContent).toMatch(/Viendo/);
    expect(screen.getByRole('button', { name: /Watch 1/ }).textContent).toMatch(/Finalizado/);
    expect(screen.getByText('12 of 24 episodes')).toBeInTheDocument();
    expect(screen.getByText('24 of 24 episodes')).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(2);
  });

  it('expands one watch into its own cycle-scoped episode list', () => {
    const calls: EpisodeHookCall[] = [];
    renderSection(calls);

    fireEvent.click(screen.getByRole('button', { name: /Watch 2/ }));

    expect(calls).toContainEqual({ animeId: 'anime-1', cycle: 2, enabled: true });
    expect(screen.getByText('Episode 12')).toBeInTheDocument();
    expect(screen.getAllByText('Watch 2')).toHaveLength(2);
    expect(screen.queryByText('Episode 11')).not.toBeInTheDocument();
  });

  it('keeps loaded rows after collapsing their watch', () => {
    const calls: EpisodeHookCall[] = [];
    renderSection(calls);
    const trigger = screen.getByRole('button', { name: /Watch 2/ });

    fireEvent.click(trigger);
    expect(screen.getByText('Episode 12')).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByText('Episode 12')).toBeInTheDocument();
  });

  it('switching to All episodes unmounts the By-watch panels and loads the flat cycle-0 list', () => {
    const calls: EpisodeHookCall[] = [];
    renderSection(calls);

    fireEvent.click(screen.getByRole('tab', { name: 'All episodes' }));

    expect(screen.queryByRole('button', { name: /Watch 2/ })).not.toBeInTheDocument();
    expect(calls).toContainEqual({ animeId: 'anime-1', cycle: 0, enabled: true });
    expect(screen.getByText('Episode 11')).toBeInTheDocument();
    expect(screen.getByText('Watch 1')).toBeInTheDocument();
  });

  it('shows only the loading skeleton on the All-episodes tab while unresolved, never rows', () => {
    const calls: EpisodeHookCall[] = [];
    vi.spyOn(useAnimeWatchEpisodesModule, 'useAnimeWatchEpisodes').mockImplementation(
      (animeId: string, cycle?: number, enabled?: boolean) => {
        calls.push({ animeId, cycle, enabled });

        return idleState({ isLoading: cycle === 0, entries: [entry({ episode: 11, cycle: 1 })] });
      },
    );
    render(<AnimeWatchHistory animeId="anime-1" detail={detailFixture()} />);

    fireEvent.click(screen.getByRole('tab', { name: 'All episodes' }));

    expect(screen.getByRole('status', { name: 'Loading episode history...' })).toBeInTheDocument();
    expect(screen.queryByText('Episode 11')).not.toBeInTheDocument();
  });

  it('shows the empty state, not a blank tab, when the anime has no recorded rows', () => {
    const calls: EpisodeHookCall[] = [];
    renderSection(calls);

    fireEvent.click(screen.getByRole('tab', { name: 'All episodes' }));
    expect(screen.queryByText('No episode history yet')).not.toBeInTheDocument();

    cleanup();
    vi.restoreAllMocks();
    vi.spyOn(useAnimeWatchEpisodesModule, 'useAnimeWatchEpisodes').mockReturnValue(idleState());
    render(<AnimeWatchHistory animeId="anime-1" detail={detailFixture()} />);

    fireEvent.click(screen.getByRole('tab', { name: 'All episodes' }));
    expect(screen.getByText('No episode history yet')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders the dashed summary, never episode rows, for a pre-log watch', () => {
    const calls: EpisodeHookCall[] = [];
    const base = detailFixture();
    const preLog = {
      ...base,
      repetitions: [
        {
          numRepetitions: 0,
          episodesWatched: 12,
          status: 1,
          createdAt: new Date(2021, 6, 3).getTime(),
          premieredAt: new Date(2021, 6, 3).getTime(),
          lastWatchedAt: new Date(2021, 8, 1).getTime(),
          deletedAt: new Date(2021, 8, 8).getTime(),
        },
      ],
    };
    stubEpisodesByCycle(calls);
    render(<AnimeWatchHistory animeId="anime-1" detail={preLog} />);

    expect(screen.getByTestId('watch-summary-1')).toBeInTheDocument();
    expect(screen.getByText('Started')).toBeInTheDocument();
    expect(screen.getByText('Premiere')).toBeInTheDocument();
    expect(screen.getByText('Last watched')).toBeInTheDocument();
    expect(screen.getByText('Ended')).toBeInTheDocument();
    expect(screen.queryByText(/Episode \d+/)).toBeNull();
  });

  it('shows the surface error alert, never rows, when the flat request fails', () => {
    vi.spyOn(useAnimeWatchEpisodesModule, 'useAnimeWatchEpisodes').mockReturnValue(
      idleState({ error: new Error('episode history service unavailable') }),
    );
    render(<AnimeWatchHistory animeId="anime-1" detail={detailFixture()} />);

    fireEvent.click(screen.getByRole('tab', { name: 'All episodes' }));

    expect(screen.getByText('Episode history unavailable')).toBeInTheDocument();
    expect(screen.getByText('episode history service unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Episode 12')).toBeNull();
  });
});
