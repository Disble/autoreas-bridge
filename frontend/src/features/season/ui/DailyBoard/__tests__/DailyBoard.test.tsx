import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source';
import { DailyBoard } from '../DailyBoard';
import { useDailyBoard } from '../use-daily-board';

vi.mock('../use-daily-board', () => ({
  useDailyBoard: vi.fn(),
}));

const mockedUseDailyBoard = vi.mocked(useDailyBoard);
type HookReturn = ReturnType<typeof useDailyBoard>;

function row(overrides: Partial<SeasonAnimeRow> = {}): SeasonAnimeRow {
  return {
    id: 'sa-a',
    rawName: 'Anime A',
    matchStatus: 'matched',
    matchedSlug: 'x',
    candidates: [],
    availability: 'created',
    animeId: 'anime-a',
    ...overrides,
  };
}

function mockHook(overrides: Partial<HookReturn> = {}): HookReturn {
  const value: HookReturn = {
    groups: { created: [], waiting: [], other: [] },
    errorMessage: undefined,
    onMove: vi.fn(),
    onRecheck: vi.fn(),
    ...overrides,
  };
  mockedUseDailyBoard.mockReturnValue(value);
  return value;
}

describe('DailyBoard', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the empty state when there are no rows', () => {
    mockHook();
    render(<DailyBoard />);
    expect(screen.getByText(/No season animes yet/)).toBeInTheDocument();
  });

  it('renders a created anime with stage-move buttons', () => {
    mockHook({ groups: { created: [row()], waiting: [], other: [] } });
    render(<DailyBoard />);
    expect(screen.getByText('Available today')).toBeInTheDocument();
    expect(screen.getByText('Anime A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver hoy' })).toBeInTheDocument();
  });

  it('moving an anime delegates to onMove with the section', () => {
    const onMove = vi.fn();
    mockHook({ groups: { created: [row()], waiting: [], other: [] }, onMove });
    render(<DailyBoard />);

    fireEvent.click(screen.getByRole('button', { name: 'Ver hoy' }));
    expect(onMove).toHaveBeenCalledWith('anime-a', 'Ver hoy');
  });

  it('re-check now triggers a recheck', () => {
    const onRecheck = vi.fn();
    mockHook({ onRecheck });
    render(<DailyBoard />);

    fireEvent.click(screen.getByRole('button', { name: 'Re-check now' }));
    expect(onRecheck).toHaveBeenCalled();
  });
});
