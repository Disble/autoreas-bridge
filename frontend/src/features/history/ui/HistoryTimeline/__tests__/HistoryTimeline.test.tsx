import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HistoryTimelineEntry, HistoryTimelineGroup, HistoryTimelineState } from '../history-timeline.types';
import { HistoryTimeline } from '../HistoryTimeline';
import * as useHistoryTimelineModule from '../use-history-timeline';

/** Builds a minimal WatchHistoryEntry fixture, overriding only what a case needs. */
function entry(overrides: Partial<HistoryTimelineEntry>): HistoryTimelineEntry {
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
function group(overrides: Partial<HistoryTimelineGroup>): HistoryTimelineGroup {
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

  it('renders one ListBox option per episode, newest first within the day', () => {
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

    const rows = screen.getAllByRole('option');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Frieren');
    expect(rows[0]).toHaveTextContent('Episode 12');
    expect(rows[1]).toHaveTextContent('Bocchi the Rock');
    expect(rows[1]).toHaveTextContent('Episode 5');
  });

  it('renders the current status before Rewatch only for repeated episodes', () => {
    renderTimeline({
      groups: [group({ entries: [
        entry({ id: 2, cycle: 2, statusColor: 'accent', statusLabel: 'Viendo' }),
        entry({ id: 1, statusColor: 'success', statusLabel: 'Finalizado' }),
        entry({ id: 3, animeId: 'deleted', animeName: 'Deleted anime' }),
      ] })],
    });

    const repeatedRow = screen.getByRole('option', { name: /Viendo.*Rewatch/ });
    const firstWatchRow = screen.getByRole('option', { name: /Finalizado/ });
    const deletedRow = screen.getByRole('option', { name: /Deleted anime/ });

    expect(repeatedRow.textContent?.indexOf('Viendo')).toBeLessThan(repeatedRow.textContent?.indexOf('Rewatch') ?? 0);
    expect(firstWatchRow).not.toHaveTextContent('Rewatch');
    expect(deletedRow).not.toHaveTextContent('Viendo');
  });

  it('shows only the loading skeleton while the first page is unresolved, never real rows', () => {
    renderTimeline({
      isLoading: true,
      groups: [group({ entries: [entry({})] })],
    });

    expect(screen.getByRole('status', { name: 'Loading watch history...' })).toBeInTheDocument();
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('shows the empty state, not a blank screen, when the first page resolves with zero rows', () => {
    renderTimeline({ groups: [] });

    expect(screen.getByText('No watch history yet')).toBeInTheDocument();
    expect(screen.getByText(/Watch history starts 2026-07-05/)).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('shows the surface error alert, never a skeleton or empty state, when the request fails', () => {
    renderTimeline({ groups: [], error: new Error('watch history service unavailable') });

    expect(screen.getByText('Watch history unavailable')).toBeInTheDocument();
    expect(screen.getByText('watch history service unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('No watch history yet')).toBeNull();
  });
});
