import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OrderingInstance } from '../ordering-board.types';
import { OrderingBoard } from '../OrderingBoard';
import { useOrderingBoard } from '../use-ordering-board';

vi.mock('../use-ordering-board', () => ({ useOrderingBoard: vi.fn() }));

const mockedUseOrderingBoard = vi.mocked(useOrderingBoard);
type HookReturn = ReturnType<typeof useOrderingBoard>;

function card(overrides: Partial<OrderingInstance> = {}): OrderingInstance {
  return { key: 'a#0', animeId: 'a', name: 'Anime A', isPendingDuplicate: false, section: 'Visto', orden: 0, isNewcomer: false, ...overrides };
}

function mockHook(overrides: Partial<HookReturn> = {}): HookReturn {
  const value: HookReturn = {
    rail: [],
    isPastSeason: false,
    columns: {},
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
    expect(screen.getByText('1. On Thursday')).toBeInTheDocument();
    expect(screen.getByText('1 changes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate To Place to another day' }));
    expect(duplicate).toHaveBeenCalledWith('r');
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

  it('shows reopen + close-season controls and a summary when read-only', () => {
    const onCloseSeason = vi.fn();
    mockHook({ readOnly: true, scheduledCount: 12, onCloseSeason });
    render(<OrderingBoard />);
    expect(screen.getByText(/12 animes scheduled/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reopen ordering' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close season' }));
    expect(onCloseSeason).toHaveBeenCalled();
  });
});
