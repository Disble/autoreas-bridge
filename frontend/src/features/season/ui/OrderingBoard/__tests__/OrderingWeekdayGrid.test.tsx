import { DragDropProvider } from '@dnd-kit/react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ANIME_SCHEDULE_ORDERING_EMPTY_MESSAGE } from '../../../../../shared/ordering/ui/AnimeScheduleOrdering/anime-schedule-ordering.constants';
import { WEEKDAYS } from '../ordering-board.constants';
import type { OrderingInstance } from '../ordering-board.types';
import type { OrderingWeekdayGridProps } from '../ordering-weekday-grid.types';
import { OrderingWeekdayGrid } from '../OrderingWeekdayGrid';

/** Builds one board card with the fields this suite cares about. */
function card(overrides: Partial<OrderingInstance> = {}): OrderingInstance {
  return { key: 'a#0', animeId: 'a', name: 'Anime A', baseModifiedAt: 0, originHighlighted: false, isPendingDuplicate: false, section: 'Visto', orden: 0, isNewcomer: false, ...overrides };
}

/** Renders the grid inside the provider its sortable cards require, overriding only what a case sets. */
function renderGrid(overrides: Partial<OrderingWeekdayGridProps> = {}) {
  const props: OrderingWeekdayGridProps = {
    columns: {},
    readOnly: false,
    meta: {},
    counts: {},
    onDuplicate: vi.fn(),
    onRemove: vi.fn(),
    onOpenPage: vi.fn(),
    onCopyPage: vi.fn(),
    onOpenFolder: vi.fn(),
    onCopyFolder: vi.fn(),
    getCoverThumb: vi.fn(() => ({ coverSrc: undefined, isLoading: false })),
    ...overrides,
  };
  render(
    <DragDropProvider>
      <OrderingWeekdayGrid {...props} />
    </DragDropProvider>,
  );
  return props;
}

describe('OrderingWeekdayGrid', () => {
  afterEach(cleanup);

  it('renders the seven weekday lanes as named drop zones in Monday-to-Sunday order', () => {
    renderGrid();

    expect(screen.getAllByRole('group').map((zone) => zone.getAttribute('aria-label'))).toStrictEqual([...WEEKDAYS]);
  });

  it('puts each card in its own weekday and shows the empty message in every other lane', () => {
    renderGrid({
      columns: { Jueves: [card({ key: 'g#0', animeId: 'g', name: 'On Thursday' })] },
      counts: { g: 1 },
    });

    expect(within(screen.getByRole('group', { name: 'Jueves' })).getByText('On Thursday')).toBeInTheDocument();
    expect(screen.getAllByText(ANIME_SCHEDULE_ORDERING_EMPTY_MESSAGE)).toHaveLength(WEEKDAYS.length - 1);
  });

  it('tags newcomers on weekday lanes and forwards the card actions with the card identity', () => {
    const props = renderGrid({
      columns: { Lunes: [card({ key: 'g#0', animeId: 'g', name: 'On Monday', isNewcomer: true })] },
      counts: { g: 2 },
    });

    expect(screen.getByText('New')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate On Monday to another day' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove On Monday' }));
    expect(props.onDuplicate).toHaveBeenCalledWith('g');
    expect(props.onRemove).toHaveBeenCalledWith('g#0');
  });

  it('renders each card with the cover its anime resolves to', () => {
    const props = renderGrid({
      columns: { Lunes: [card({ key: 'g#0', animeId: 'g', name: 'With cover' }), card({ key: 'p#0', animeId: 'p', name: 'Pending' })] },
      counts: { g: 1, p: 1 },
      getCoverThumb: vi.fn((animeId: string) => (animeId === 'g' ? { coverSrc: 'data:g', isLoading: false } : { coverSrc: undefined, isLoading: true })),
    });

    const lane = within(screen.getByRole('group', { name: 'Lunes' }));
    expect(lane.getByTestId('season-cover-thumb-image')).toHaveAttribute('src', 'data:g');
    expect(lane.getAllByTestId('season-cover-thumb')).toHaveLength(2);
    expect(lane.getByTestId('season-cover-thumb-loading')).toBeInTheDocument();
    expect(props.getCoverThumb).toHaveBeenCalledWith('g');
    expect(props.getCoverThumb).toHaveBeenCalledWith('p');
  });
});
