import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WatchHistoryEntry } from '../../../../../shared/contracts/anime.types';
import type { HistoryDayGroup } from '../../../../../shared/watch-history/watch-history.types';
import type { HistoryTimelineState } from '../history-timeline.types';
import { HistoryTimeline } from '../HistoryTimeline';
import * as useHistoryTimelineModule from '../use-history-timeline';

// Spy instead of vi.mock: react-router is excluded from the deps optimizer so
// its namespace stays spyable (see vite.config.ts), mirroring HistoryTable's
// own test.
/** Captures navigation calls from the spied react-router hook. */
const navigateMock = vi.fn();

/** Builds a minimal WatchHistoryEntry fixture, overriding only what a case needs. */
function entry(overrides: Partial<WatchHistoryEntry>): WatchHistoryEntry {
  return {
    id: 1,
    animeId: 'anime-1',
    animeName: 'Frieren',
    episode: 1,
    cycle: 1,
    watchedAtMs: Date.UTC(2026, 8, 12, 12, 0),
    source: 'desktop',
    ...overrides,
  };
}

/** Builds a single day group fixture, overriding only what a case needs. */
function group(overrides: Partial<HistoryDayGroup>): HistoryDayGroup {
  return {
    dayKey: '2026-09-12',
    heading: 'September 12, 2026',
    count: 1,
    partial: false,
    entries: [],
    ...overrides,
  };
}

/** Renders HistoryTimeline behind a router with the hook stubbed to the given state. */
function renderTimeline(overrides: Partial<HistoryTimelineState>) {
  vi.spyOn(ReactRouter, 'useNavigate').mockReturnValue(navigateMock);
  vi.spyOn(useHistoryTimelineModule, 'useHistoryTimeline').mockReturnValue({
    groups: [],
    isLoading: false,
    hasMore: false,
    error: undefined,
    fetchNextPage: vi.fn(),
    onScroll: vi.fn(),
    ...overrides,
  });

  return render(
    <MemoryRouter>
      <HistoryTimeline />
    </MemoryRouter>,
  );
}

describe('HistoryTimeline', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    navigateMock.mockClear();
  });

  it('renders a heading per loaded day, each showing that day\'s episode count', () => {
    renderTimeline({
      groups: [
        group({
          count: 2,
          entries: [
            entry({ id: 2, episode: 12, watchedAtMs: Date.UTC(2026, 8, 12, 20, 0) }),
            entry({ id: 1, episode: 11, watchedAtMs: Date.UTC(2026, 8, 12, 12, 0) }),
          ],
        }),
        group({
          dayKey: '2026-09-11',
          heading: 'September 11, 2026',
          partial: true,
          entries: [entry({ id: 3, animeId: 'anime-2', animeName: 'Bocchi the Rock', episode: 5, watchedAtMs: Date.UTC(2026, 8, 11, 12, 0) })],
        }),
      ],
    });

    expect(screen.getByText('September 12, 2026 (2)')).toBeInTheDocument();
    expect(screen.getByText('September 11, 2026 (1)')).toBeInTheDocument();
  });

  it('renders one row per episode, newest first within the day', () => {
    renderTimeline({
      groups: [
        group({
          count: 2,
          entries: [
            entry({ id: 2, episode: 12, watchedAtMs: Date.UTC(2026, 8, 12, 20, 0) }),
            entry({ id: 1, animeId: 'anime-2', animeName: 'Bocchi the Rock', episode: 5, watchedAtMs: Date.UTC(2026, 8, 12, 8, 0) }),
          ],
        }),
      ],
    });

    const rows = screen.getAllByRole('button');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Frieren');
    expect(rows[0]).toHaveTextContent('Episode 12');
    expect(rows[1]).toHaveTextContent('Bocchi the Rock');
    expect(rows[1]).toHaveTextContent('Episode 5');
  });

  it('navigates to the anime detail when a row is activated anywhere in the row', () => {
    renderTimeline({
      groups: [group({ entries: [entry({})] })],
    });

    fireEvent.click(screen.getByRole('button', { name: /Frieren/ }));

    expect(navigateMock).toHaveBeenCalledWith('/catalog/detail/anime-1');
  });

  it('shows only the loading skeleton while the first page is unresolved, never real rows', () => {
    renderTimeline({
      isLoading: true,
      groups: [group({ entries: [entry({})] })],
    });

    expect(screen.getByRole('status', { name: 'Loading watch history...' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the empty state, not a blank screen, when the first page resolves with zero rows', () => {
    renderTimeline({ groups: [] });

    expect(screen.getByText('No watch history yet')).toBeInTheDocument();
    expect(screen.getByText(/Watch history starts 2026-07-05/)).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the surface error alert, never a skeleton or empty state, when the request fails', () => {
    renderTimeline({ groups: [], error: new Error('watch history service unavailable') });

    expect(screen.getByText('Watch history unavailable')).toBeInTheDocument();
    expect(screen.getByText('watch history service unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('No watch history yet')).toBeNull();
  });
});
