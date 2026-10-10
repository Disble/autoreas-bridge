import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ANIME_SCHEDULE_ORDERING_EMPTY_MESSAGE } from '../../../../../shared/ordering/ui/AnimeScheduleOrdering/anime-schedule-ordering.constants';
import {
  ORDERING_EMPTY_DESCRIPTION,
  ORDERING_EMPTY_MESSAGE,
  ORDERING_EMPTY_TITLE,
} from '../ordering-board.constants';
import type { OrderingInstance } from '../ordering-board.types';
import { OrderingBoard } from '../OrderingBoard';
import { useOrderingBoard } from '../use-ordering-board';

vi.mock('../use-ordering-board', () => ({ useOrderingBoard: vi.fn() }));

/** Mocked hook each case drives to one board state. */
const mockedUseOrderingBoard = vi.mocked(useOrderingBoard);
/** Shape of the hook's return value, so a case can override only what it exercises. */
type HookReturn = ReturnType<typeof useOrderingBoard>;

/** Builds one rail card. */
function card(): OrderingInstance {
  return { key: 'r#0', animeId: 'r', name: 'To Place', baseModifiedAt: 0, originHighlighted: false, isPendingDuplicate: false, section: 'Visto', orden: 0, isNewcomer: false };
}

/** Stubs the hook with an empty live board, overriding only what a case sets. */
function mockHook(overrides: Partial<HookReturn> = {}): void {
  mockedUseOrderingBoard.mockReturnValue({
    rail: [],
    columns: {},
    meta: {},
    instances: {},
    counts: {},
    changeCount: 0,
    scheduledCount: 0,
    hasInvalidWeekdayPlacements: false,
    readOnly: false,
    isPastSeason: false,
    isHistoricalLoading: false,
    historicalRecorded: true,
    historicalError: undefined,
    errorMessage: undefined,
    ...overrides,
  } as HookReturn);
}

describe('OrderingBoard empty states', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the compact Airis empty state in the empty rail and navigates to Selection', () => {
    const onNavigate = vi.fn();
    mockHook();
    const { container } = render(<OrderingBoard onNavigate={onNavigate} />);

    expect(screen.getByRole('heading', { name: ORDERING_EMPTY_TITLE })).toBeInTheDocument();
    expect(screen.getByText(ORDERING_EMPTY_DESCRIPTION)).toBeInTheDocument();
    expect(screen.queryByText(ORDERING_EMPTY_MESSAGE)).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="card"]')).toBeNull();
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Go to Selection' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('selection');
  });

  it('renders the rail cards instead of the empty state when the rail has items', () => {
    mockHook({ rail: [card()], counts: { r: 1 } });
    render(<OrderingBoard onNavigate={vi.fn()} />);

    expect(screen.getByText('To Place')).toBeInTheDocument();
    expect(screen.queryByText(ORDERING_EMPTY_TITLE)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to Selection' })).not.toBeInTheDocument();
  });

  it('keeps each weekday lane on its own plain message, never the Airis empty state', () => {
    mockHook({ rail: [card()], counts: { r: 1 } });
    render(<OrderingBoard onNavigate={vi.fn()} />);

    expect(screen.getAllByText(ANIME_SCHEDULE_ORDERING_EMPTY_MESSAGE)).toHaveLength(7);
    expect(screen.queryByText(ORDERING_EMPTY_TITLE)).not.toBeInTheDocument();
  });

  it('keeps the empty weekday lanes plain while the rail shows the Airis empty state', () => {
    mockHook();
    render(<OrderingBoard onNavigate={vi.fn()} />);

    const lane = screen.getByRole('heading', { name: 'Lunes' }).parentElement?.parentElement as HTMLElement;
    expect(within(lane).getByText(ANIME_SCHEDULE_ORDERING_EMPTY_MESSAGE)).toBeInTheDocument();
    expect(within(lane).queryByText(ORDERING_EMPTY_TITLE)).not.toBeInTheDocument();
    expect(screen.getAllByText(ORDERING_EMPTY_TITLE)).toHaveLength(1);
  });

  it('keeps the plain rail message, without a Selection action, on a recorded past season', () => {
    mockHook({ isPastSeason: true, readOnly: true });
    render(<OrderingBoard onNavigate={vi.fn()} />);

    expect(screen.getByText(ORDERING_EMPTY_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(ORDERING_EMPTY_TITLE)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to Selection' })).not.toBeInTheDocument();
  });

  it.each([
    ['live', { isPastSeason: false }],
    ['past', { isPastSeason: true, readOnly: true }],
  ])('renders no rail empty content on a %s board while the season store holds an error', (_name, overrides) => {
    mockHook({ ...overrides, errorMessage: 'animes failed to load' });
    render(<OrderingBoard onNavigate={vi.fn()} />);

    expect(screen.queryByText(ORDERING_EMPTY_TITLE)).not.toBeInTheDocument();
    expect(screen.queryByText(ORDERING_EMPTY_DESCRIPTION)).not.toBeInTheDocument();
    expect(screen.queryByText(ORDERING_EMPTY_MESSAGE)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to Selection' })).not.toBeInTheDocument();
    expect(screen.getAllByText(ANIME_SCHEDULE_ORDERING_EMPTY_MESSAGE)).toHaveLength(7);
  });

  it('still renders the rail cards while the season store holds an error', () => {
    mockHook({ rail: [card()], counts: { r: 1 }, errorMessage: 'animes failed to load' });
    render(<OrderingBoard onNavigate={vi.fn()} />);

    expect(screen.getByText('To Place')).toBeInTheDocument();
  });
});
