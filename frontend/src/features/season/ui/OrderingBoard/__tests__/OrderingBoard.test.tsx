import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ORDERING_NOT_RECORDED_TITLE, ORDERING_PAST_SEASON_NOTICE } from '../ordering-board.constants';
import { ANIME_SCHEDULE_ORDERING_EMPTY_MESSAGE } from '../../../../../shared/ordering/ui/AnimeScheduleOrdering/anime-schedule-ordering.constants';
import type { OrderingInstance } from '../ordering-board.types';
import { OrderingBoard } from '../OrderingBoard';
import { useOrderingBoard } from '../use-ordering-board';

vi.mock('../use-ordering-board', () => ({ useOrderingBoard: vi.fn() }));

/** Mocked hook the component tests drive directly, so each case renders one board state. */
const mockedUseOrderingBoard = vi.mocked(useOrderingBoard);
/** Shape of the hook's return value, so a case can override only what it exercises. */
type HookReturn = ReturnType<typeof useOrderingBoard>;

/** Builds one board card with the fields this suite cares about. */
function card(overrides: Partial<OrderingInstance> = {}): OrderingInstance {
  return { key: 'a#0', animeId: 'a', name: 'Anime A', baseModifiedAt: 0, originHighlighted: false, isPendingDuplicate: false, section: 'Visto', orden: 0, isNewcomer: false, ...overrides };
}

/** Renders the board with a stubbed hook, overriding only the fields a case sets. */
function mockHook(overrides: Partial<HookReturn> = {}): HookReturn {
  const value: HookReturn = {
    rail: [],
    isPastSeason: false,
    isHistoricalLoading: false,
    historicalRecorded: true,
    historicalError: undefined,
    columns: {},
    meta: {},
    instances: {},
    counts: {},
    changeCount: 0,
    scheduledCount: 0,
    hasInvalidWeekdayPlacements: false,
    readOnly: false,
    onDragOver: vi.fn(),
    duplicate: vi.fn(),
    removeCard: vi.fn(),
    onApply: vi.fn().mockResolvedValue({ status: 'ok', applied: 0, failed: [] }),
    onReset: vi.fn(),
    onReopen: vi.fn(),
    onCloseSeason: vi.fn(),
    onOpenPage: vi.fn(),
    onCopyPage: vi.fn(),
    onOpenFolder: vi.fn(),
    onCopyFolder: vi.fn(),
    ...overrides,
  };
  mockedUseOrderingBoard.mockReturnValue(value);
  return value;
}

describe('OrderingBoard', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the empty rail message and the seven weekday columns', () => {
    mockHook();
    render(<OrderingBoard />);
    expect(screen.getByText(/No approved animes to place yet/)).toBeInTheDocument();
    for (const day of ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']) {
      expect(screen.getByText(day)).toBeInTheDocument();
    }
  });

  it('renders a rail card and a placed grid card', () => {
    const duplicate = vi.fn();
    mockHook({
      rail: [card({ key: 'r#0', animeId: 'r', name: 'To Place' })],
      columns: { Jueves: [card({ key: 'g#0', animeId: 'g', name: 'On Thursday', orden: 1 })] },
      counts: { r: 1, g: 1 },
      changeCount: 1,
      duplicate,
    });
    render(<OrderingBoard />);
    expect(screen.getByText('To Place')).toBeInTheDocument();
    expect(screen.getByText('On Thursday')).toBeInTheDocument();
    expect(screen.getByText('1 changes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate To Place to another day' }));
    expect(duplicate).toHaveBeenCalledWith('r');
  });

  it('shows the grade and page/folder actions on a card when meta is present', () => {
    const onOpenPage = vi.fn();
    const onOpenFolder = vi.fn();
    mockHook({
      rail: [card({ key: 'r#0', animeId: 'r', name: 'To Place' })],
      counts: { r: 1 },
      meta: { r: { grade: 6, hasPage: true, hasFolder: true, pageUrl: 'https://x', folderPath: 'D:/a' } },
      onOpenPage,
      onOpenFolder,
    });
    render(<OrderingBoard />);

    expect(screen.getByText('6')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Open page for To Place/ }));
    expect(onOpenPage).toHaveBeenCalledWith('r');
    fireEvent.click(screen.getByRole('button', { name: /Open folder for To Place/ }));
    expect(onOpenFolder).toHaveBeenCalledWith('r');
  });

  it('renders multiple approved-rail duplicates for the same anime', () => {
    mockHook({
      rail: [
        card({ key: 'r#0', animeId: 'r', name: 'To Place', isPendingDuplicate: false }),
        card({ key: 'r#1', animeId: 'r', name: 'To Place', isPendingDuplicate: true, section: '' }),
        card({ key: 'r#2', animeId: 'r', name: 'To Place', isPendingDuplicate: true, section: '' }),
      ],
      counts: { r: 3 },
    });

    render(<OrderingBoard />);

    expect(screen.getAllByText('To Place')).toHaveLength(3);
  });

  it('applies the schedule', () => {
    const onApply = vi.fn().mockResolvedValue({ status: 'ok', applied: 1, failed: [] });
    mockHook({ columns: { Lunes: [card({ key: 'g#0', animeId: 'g', orden: 1 })] }, counts: { g: 1 }, changeCount: 1, onApply });
    render(<OrderingBoard />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply schedule' }));
    expect(onApply).toHaveBeenCalled();
  });

  it('disables apply when the board contains an invalid duplicate weekday placement', () => {
    mockHook({
      columns: { Lunes: [card({ key: 'g#0', animeId: 'g', orden: 1 }), card({ key: 'g#1', animeId: 'g', orden: 2 })] },
      counts: { g: 2 },
      changeCount: 1,
      hasInvalidWeekdayPlacements: true,
    });

    render(<OrderingBoard />);

    expect(screen.getByRole('button', { name: 'Apply schedule' })).toBeDisabled();
  });

  it('shows reopen + close-season controls and a success summary when an applied season is read-only', () => {
    const onCloseSeason = vi.fn();
    const onReopen = vi.fn();
    mockHook({ readOnly: true, scheduledCount: 12, onCloseSeason, onReopen });
    render(<OrderingBoard />);
    const summary = screen.getByText(/12 animes scheduled/);
    expect(summary).toBeInTheDocument();
    expect(summary.closest('[data-slot="alert-root"]')).toHaveClass('alert--success');
    fireEvent.click(screen.getByRole('button', { name: 'Reopen ordering' }));
    expect(onReopen).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close season' }));
    expect(onCloseSeason).toHaveBeenCalled();
  });

  it('renders the stored past-season board and a notice that never claims the live schedule', () => {
    mockHook({
      readOnly: true,
      isPastSeason: true,
      historicalRecorded: true,
      rail: [card({ key: 'r#0', animeId: 'r', name: 'Stored Rail Card' })],
      counts: { r: 1 },
    });
    render(<OrderingBoard />);

    expect(screen.getByText('Stored Rail Card')).toBeInTheDocument();
    const notice = screen.getByText(ORDERING_PAST_SEASON_NOTICE);
    expect(notice).toBeInTheDocument();
    expect(notice.closest('[data-slot="alert-root"]')).toHaveClass('alert--warning');
    expect(screen.queryByText(/reflects the live schedule/)).toBeNull();
  });

  it.each([
    { priorState: 'the previous board was recorded', recorded: true },
    { priorState: 'the previous read found no record', recorded: false },
  ])('shows ONLY the loading status while a past-season snapshot is in flight ($priorState)', ({ recorded }) => {
    mockHook({
      readOnly: true,
      isPastSeason: true,
      isHistoricalLoading: true,
      historicalRecorded: recorded,
      rail: [card({ key: 'r#0', animeId: 'r', name: 'Stale Rail Card' })],
      counts: { r: 1 },
    });
    const { container } = render(<OrderingBoard />);

    expect(screen.getByRole('status', { name: /recorded ordering board/i })).toBeInTheDocument();
    expect(screen.queryByText(ORDERING_NOT_RECORDED_TITLE)).toBeNull();
    expect(container.querySelector('.alert--danger')).toBeNull();
    expect(screen.queryByText('Stale Rail Card')).toBeNull();
    expect(screen.queryByText('Lunes')).toBeNull();
  });

  it('shows ONLY the not-recorded empty state when the past season closed before its board was recorded', () => {
    mockHook({ readOnly: true, isPastSeason: true, historicalRecorded: false });
    const { container } = render(<OrderingBoard />);

    expect(screen.getByText(ORDERING_NOT_RECORDED_TITLE)).toBeInTheDocument();
    expect(screen.getByText(/closed before its ordering board was recorded/)).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.querySelector('.alert--danger')).toBeNull();
    expect(screen.queryByText('Lunes')).toBeNull();
    expect(screen.queryByText(/Approved to place/)).toBeNull();
  });

  it('shows ONLY a failure alert instead of the board when the past-season snapshot read fails', () => {
    mockHook({ readOnly: true, isPastSeason: true, historicalError: 'history read failed', historicalRecorded: false });
    const { container } = render(<OrderingBoard />);

    expect(screen.getByText('history read failed')).toBeInTheDocument();
    expect(container.querySelector('.alert--danger')).not.toBeNull();
    expect(screen.queryByText(ORDERING_NOT_RECORDED_TITLE)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('Lunes')).toBeNull();
  });

  it('keeps the failure alert in charge even when a recorded flag arrives beside the error', () => {
    // The component's contract is that a failed read wins: an error must never be
    // hidden behind a board, whatever a caller passes in `historicalRecorded`.
    mockHook({ readOnly: true, isPastSeason: true, historicalError: 'history read failed', historicalRecorded: true });
    const { container } = render(<OrderingBoard />);

    expect(screen.getByText('history read failed')).toBeInTheDocument();
    expect(container.querySelector('.alert--danger')).not.toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('Lunes')).toBeNull();
    expect(screen.queryByText(/Approved to place/)).toBeNull();
  });

  it('renders every empty weekday as an empty container and wires Remove to the card it belongs to', () => {
    const removeCard = vi.fn();
    mockHook({
      columns: { Lunes: [card({ key: 'a#0', animeId: 'a', name: 'Anime A' })] },
      counts: { a: 2 },
      removeCard,
    });
    render(<OrderingBoard />);

    // Six of the seven weekdays hold no card, and each says so instead of rendering a
    // phantom one: a placeholder card here would silently invent a scheduled anime.
    expect(screen.getAllByText(ANIME_SCHEDULE_ORDERING_EMPTY_MESSAGE)).toHaveLength(6);

    // Two copies exist, so the last card may still be removed.
    const remove = screen.getByRole('button', { name: 'Remove Anime A' });
    expect(remove).not.toBeDisabled();
    fireEvent.click(remove);
    expect(removeCard).toHaveBeenCalledWith('a#0');
  });

  it('disables Remove while an anime holds its only card', () => {
    mockHook({
      columns: { Lunes: [card({ key: 'a#0', animeId: 'a', name: 'Anime A' })] },
      counts: { a: 1 },
    });
    render(<OrderingBoard />);

    expect(screen.getByRole('button', { name: 'Remove Anime A' })).toBeDisabled();
  });
});
