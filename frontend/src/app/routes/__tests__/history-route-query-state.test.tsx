import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as useHistoryTimelineModule from '../../../features/history/ui/HistoryTimeline/use-history-timeline';
import { HistoryRoute } from '../HistoryRoute';

/** Reports the current router location's search string to the given callback after every commit. */
function LocationProbe({ onLocation }: Readonly<{ onLocation: (search: string) => void }>) {
  const location = useLocation();

  useEffect(() => {
    onLocation(location.search);
  }, [location.search, onLocation]);

  return null;
}

describe('the History route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('carries no persisted query state: the URL stays exactly /history through render and drill-down', () => {
    vi.spyOn(useHistoryTimelineModule, 'useHistoryTimeline').mockReturnValue({
      groups: [
        {
          dayKey: '2026-09-12',
          heading: 'September 12, 2026',
          count: 1,
          partial: false,
          entries: [
            { id: 1, animeId: 'anime-1', animeName: 'Frieren', episode: 11, cycle: 1, watchedAtMs: Date.UTC(2026, 8, 12, 12, 0), source: 'desktop' },
          ],
        },
      ],
      isLoading: false,
      hasMore: false,
      error: undefined,
      fetchNextPage: vi.fn(),
      onScroll: vi.fn(),
    });
    let latestSearch = 'unset';

    render(
      <MemoryRouter initialEntries={['/history']}>
        <LocationProbe
          onLocation={(search) => {
            latestSearch = search;
          }}
        />
        <Routes>
          <Route element={<HistoryRoute />} path="/history" />
          <Route element={<div>Anime detail</div>} path="/catalog/detail/:id" />
        </Routes>
      </MemoryRouter>,
    );

    expect(latestSearch).toBe('');

    fireEvent.click(screen.getByRole('button', { name: /Frieren/ }));

    expect(screen.getByText('Anime detail')).toBeInTheDocument();
    expect(latestSearch).toBe('');
  });
});
