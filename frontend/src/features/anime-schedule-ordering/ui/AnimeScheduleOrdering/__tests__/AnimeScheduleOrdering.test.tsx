import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnimeScheduleOrdering } from '../AnimeScheduleOrdering';
import { ANIME_SCHEDULE_STAGING_CONTAINER_ID } from '../anime-schedule-ordering.constants';
import type { AnimeScheduleOrderingTestDriverRef } from '../anime-schedule-ordering.types';

const board = {
  originAnimeId: 'anime-1',
  boardModifiedAt: 100,
  destinations: [{ id: 'Lunes', label: 'Lunes', kind: 'weekday' }],
  entries: [{ animeId: 'anime-1', name: 'Frieren', active: true, modifiedAt: 100, placements: [{ day: 'Lunes', order: 1 }], status: 0, progress: 1, originHighlighted: true }],
} as const;

describe('AnimeScheduleOrdering', () => {
  it('renders the global schedule board with its staging area', () => {
    render(<AnimeScheduleOrdering board={board} onApply={vi.fn().mockResolvedValue(undefined)} />);

    expect(screen.getByRole('heading', { name: 'Anime schedule' })).toBeInTheDocument();
    expect(screen.getByText('Frieren')).toBeInTheDocument();
    expect(screen.getByText('Origin')).toBeInTheDocument();
    expect(screen.getByText('Staging area')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'About the staging area' })).toBeInTheDocument();
  });

  it('warns that staged animes are ignored by apply', () => {
    const testDriverRef: AnimeScheduleOrderingTestDriverRef = {};
    render(<AnimeScheduleOrdering board={board} testDriverRef={testDriverRef} onApply={vi.fn().mockResolvedValue(undefined)} />);

    expect(screen.queryByText(/parked in the staging area/)).not.toBeInTheDocument();

    act(() => testDriverRef.current?.moveAnime({ animeId: 'anime-1', destinationId: ANIME_SCHEDULE_STAGING_CONTAINER_ID, order: 1 }));

    expect(screen.getByText(/parked in the staging area/)).toBeInTheDocument();
  });
});
