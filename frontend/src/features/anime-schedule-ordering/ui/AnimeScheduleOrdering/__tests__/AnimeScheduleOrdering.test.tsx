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

  it('renders a locked existing card as drag-disabled but still reflows it on mid-insertion', () => {
    const twoCardBoard = {
      originAnimeId: 'anime-1',
      boardModifiedAt: 100,
      destinations: [{ id: 'Lunes', label: 'Lunes', kind: 'weekday' }],
      entries: [
        { animeId: 'anime-1', name: 'Frieren', active: true, modifiedAt: 100, placements: [{ day: 'Lunes', order: 1 }], status: 0, progress: 1, originHighlighted: false },
      ],
    } as const;
    const testDriverRef: AnimeScheduleOrderingTestDriverRef = {};

    const { container } = render(
      <AnimeScheduleOrdering
        board={twoCardBoard}
        draftEntries={[{ draftId: '__draft__:1', name: 'New Anime' }]}
        lockedAnimeIds={['anime-1']}
        testDriverRef={testDriverRef}
        onApply={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const lockedCard = container.querySelector('[data-anime-id="anime-1"]');
    expect(lockedCard).toHaveAttribute('data-locked', 'true');

    act(() => testDriverRef.current?.moveAnime({ animeId: '__draft__:1', destinationId: 'Lunes', order: 1 }));

    const cardsInColumn = [...container.querySelectorAll('[data-anime-id]')];
    expect(cardsInColumn.map((card) => card.getAttribute('data-anime-id'))).toEqual(['__draft__:1', 'anime-1']);
    expect(container.querySelector('[data-anime-id="anime-1"]')).toHaveAttribute('data-locked', 'true');
  });
});
