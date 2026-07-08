import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OrderingCard } from '../../../../../infrastructure/season-source';
import { OrderingBoard } from '../OrderingBoard';
import { useOrderingBoard } from '../use-ordering-board';

vi.mock('../use-ordering-board', () => ({ useOrderingBoard: vi.fn() }));

const mockedUseOrderingBoard = vi.mocked(useOrderingBoard);
type HookReturn = ReturnType<typeof useOrderingBoard>;

function card(overrides: Partial<OrderingCard> = {}): OrderingCard {
  return { animeId: 'a', name: 'Anime A', dia: '', orden: 0, section: 'Visto', isNewcomer: false, ...overrides };
}

function mockHook(overrides: Partial<HookReturn> = {}): HookReturn {
  const value: HookReturn = {
    rail: [],
    columns: {},
    changeCount: 0,
    scheduledCount: 0,
    cardCounts: {},
    readOnly: false,
    activeCard: null,
    moveClone: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
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
    mockHook({
      rail: [card({ animeId: 'r', name: 'To Place' })],
      columns: { Jueves: [card({ animeId: 'g', name: 'On Thursday', dia: 'Jueves', orden: 1 })] },
      changeCount: 1,
    });
    render(<OrderingBoard />);
    expect(screen.getByText('To Place')).toBeInTheDocument();
    expect(screen.getByText('1. On Thursday')).toBeInTheDocument();
    expect(screen.getByText('1 changes')).toBeInTheDocument();
  });

  it('applies the schedule', () => {
    const onApply = vi.fn().mockResolvedValue({ status: 'ok', applied: 1, failed: [] });
    mockHook({ columns: { Lunes: [card({ animeId: 'g', dia: 'Lunes', orden: 1 })] }, changeCount: 1, onApply });
    render(<OrderingBoard />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply schedule' }));
    expect(onApply).toHaveBeenCalled();
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
