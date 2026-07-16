import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnimeScheduleOrdering } from '../AnimeScheduleOrdering';

describe('AnimeScheduleOrdering', () => {
  it('renders the global schedule board', () => {
    render(
      <AnimeScheduleOrdering
        board={{
          originAnimeId: 'anime-1',
          boardModifiedAt: 100,
          destinations: [{ id: 'Lunes', label: 'Lunes', kind: 'weekday' }],
          entries: [{ animeId: 'anime-1', name: 'Frieren', active: true, modifiedAt: 100, placements: [{ day: 'Lunes', order: 1 }], status: 0, progress: 1, originHighlighted: true }],
        }}
        onApply={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Anime schedule' })).toBeInTheDocument();
    expect(screen.getByText('Frieren')).toBeInTheDocument();
    expect(screen.getByText('Origin')).toBeInTheDocument();
  });
});
