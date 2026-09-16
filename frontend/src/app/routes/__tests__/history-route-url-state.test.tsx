import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as useHistoryTimelineModule from '../../../features/history/ui/HistoryTimeline/use-history-timeline';
import { HistoryRoute } from '../HistoryRoute';

/** Prints the current route so the test can read what selection, drill-down and Back wrote. */
function LocationProbe() {
  const location = useLocation();

  return <span data-testid="location">{location.pathname + location.search}</span>;
}

/** Stands in for Anime Detail, whose `onBack` pops one history entry with `navigate(-1)`. */
function DetailStub() {
  const navigate = useNavigate();

  return <button onClick={() => void navigate(-1)} type="button">Back</button>;
}

describe('the History route URL state', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('restores status, anime and row on Back from Anime Detail, in a fresh scroll container', () => {
    vi.spyOn(useHistoryTimelineModule, 'useHistoryTimeline').mockReturnValue({
      groups: [{
        dayKey: '2026-09-12',
        heading: 'September 12, 2026',
        count: 2,
        partial: false,
        entries: [
          { id: 2, animeId: 'anime-2', animeName: 'Bocchi the Rock', episode: 5, cycle: 1, watchedAtMs: Date.UTC(2026, 8, 12, 20, 0), source: 'desktop' },
          { id: 1, animeId: 'anime-1', animeName: 'Frieren', episode: 11, cycle: 1, watchedAtMs: Date.UTC(2026, 8, 12, 12, 0), source: 'desktop' },
        ],
      }],
      isLoading: false,
      hasMore: false,
      error: undefined,
      fetchNextPage: vi.fn(),
      onScroll: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={['/history?status=0&anime=anime-2&row=2']}>
        <LocationProbe />
        <Routes>
          <Route element={<HistoryRoute />} path="/history" />
          <Route element={<DetailStub />} path="/catalog/detail/:id" />
        </Routes>
      </MemoryRouter>,
    );
    const firstContainer = screen.getByTestId('history-timeline-scroll');
    const row = screen.getByRole('option', { name: /Bocchi/ });
    act(() => row.focus());
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyUp(row, { key: 'Enter' });
    expect(screen.getByTestId('location')).toHaveTextContent('/catalog/detail/anime-2');

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/history?status=0&anime=anime-2&row=2');
    expect(screen.getByRole('option', { name: /Bocchi/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('history-timeline-scroll')).not.toBe(firstContainer);
  });
});
