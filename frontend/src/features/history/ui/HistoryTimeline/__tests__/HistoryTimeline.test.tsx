import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
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

/** Prints the current route so a test can read what selection and navigation wrote. */
function LocationProbe() {
  const location = useLocation();

  return <span data-testid="location">{location.pathname + location.search}</span>;
}

/** Presses a row with a real mouse pointer; a pointer-less click is a virtual press, which performs the row action instead. */
function mouseDown(element: HTMLElement) {
  const pointer = { button: 0, detail: 1, height: 10, pointerId: 1, pointerType: 'mouse', pressure: 0.5, width: 10 };

  fireEvent.pointerDown(element, pointer);
  fireEvent.pointerUp(element, pointer);
  fireEvent.click(element, pointer);
}

/** Renders HistoryTimeline at `url` behind a router with the timeline data hook stubbed to the given state. */
function renderTimeline(overrides: Partial<HistoryTimelineState>, url = '/history') {
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
    <MemoryRouter initialEntries={[url]}>
      <LocationProbe />
      <Routes>
        <Route element={<HistoryTimeline />} path="/history" />
        <Route element={<div>Anime detail</div>} path="/catalog/detail/:id" />
      </Routes>
    </MemoryRouter>,
  );
}

/** One day with two anime rows: row 2 (Bocchi the Rock) above row 1 (Frieren). */
const twoRows = [group({ count: 2, entries: [entry({ id: 2, animeId: 'anime-2', animeName: 'Bocchi the Rock' }), entry({ id: 1 })] })];

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

  it('renders the filter bar above the list', () => {
    renderTimeline({ groups: twoRows });

    expect(screen.getByRole('region', { name: 'History filters' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: /search/i })).toBeInTheDocument();
  });

  it('selects a clicked row into the URL without navigating, and restores that row from the URL', () => {
    renderTimeline({ groups: twoRows }, '/history?status=0&anime=anime-1&row=1');

    expect(screen.getByRole('option', { name: /Frieren/ })).toHaveAttribute('aria-selected', 'true');

    mouseDown(screen.getByRole('option', { name: /Bocchi/ }));

    expect(screen.getByTestId('location')).toHaveTextContent('/history?status=0&anime=anime-2&row=2');
    expect(screen.getByRole('option', { name: /Bocchi/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Anime detail')).toBeNull();
  });

  it('moves the selection with the arrow keys', () => {
    renderTimeline({ groups: twoRows }, '/history?anime=anime-2&row=2');

    act(() => screen.getByRole('option', { name: /Bocchi/ }).focus());
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'ArrowDown' });

    expect(screen.getByTestId('location')).toHaveTextContent('/history?anime=anime-1&row=1');
  });

  it.each<[string, (row: HTMLElement) => void]>([
    ['Enter', (row) => {
      act(() => row.focus());
      fireEvent.keyDown(row, { key: 'Enter' });
      fireEvent.keyUp(row, { key: 'Enter' });
    }],
    ['a double-click', (row) => {
      mouseDown(row);
      fireEvent.doubleClick(row, { detail: 2 });
    }],
  ])("opens the row's anime detail on %s", (_label, open) => {
    renderTimeline({ groups: twoRows }, '/history?anime=anime-2&row=2');

    open(screen.getByRole('option', { name: /Bocchi/ }));

    expect(screen.getByText('Anime detail')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/catalog/detail/anime-2');
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

  it('says no episodes match, instead of the unfiltered empty copy, when a filter narrows to zero rows', () => {
    renderTimeline({ groups: [] }, '/history?type=1');

    expect(screen.getByText('No episodes match these filters')).toBeInTheDocument();
    expect(screen.queryByText('No watch history yet')).toBeNull();
  });

  it('shows the surface error alert, never a skeleton or empty state, when the request fails', () => {
    renderTimeline({ groups: [], error: new Error('watch history service unavailable') });

    expect(screen.getByText('Watch history unavailable')).toBeInTheDocument();
    expect(screen.getByText('watch history service unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('No watch history yet')).toBeNull();
  });
});
