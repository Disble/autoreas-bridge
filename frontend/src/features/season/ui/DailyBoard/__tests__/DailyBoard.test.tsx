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

function created(id: string, animeId: string, section: string): SeasonAnimeRow {
  return {
    id,
    rawName: id.toUpperCase(),
    matchStatus: 'matched',
    matchedSlug: 'x',
    candidates: [],
    availability: 'created',
    animeId,
    section,
    grade: 0,
    gradeSource: '',
    skipGrading: false,
  };
}

function mockHook(overrides: Partial<HookReturn> = {}): HookReturn {
  const value: HookReturn = {
    sections: { sinVer: [], verHoy: [], visto: [] },
    selected: new Set<string>(),
    toggleSelect: vi.fn(),
    onSendToVerHoy: vi.fn(),
    onRecheck: vi.fn(),
    errorMessage: undefined,
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

  it('shows the empty state when there are no created animes', () => {
    mockHook();
    render(<DailyBoard />);
    expect(screen.getByText(/No created animes yet/)).toBeInTheDocument();
  });

  it('renders the Sin ver pool with checkbox labels', () => {
    mockHook({ sections: { sinVer: [created('a', 'anime-a', 'Sin ver')], verHoy: [], visto: [] } });
    render(<DailyBoard />);
    expect(screen.getByText('Sin ver — pick what you watch today')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  // Note: the checkbox onChange → toggleSelect wiring is verified by the hook
  // test; HeroUI v3 Checkbox renders a bare div under jsdom (React Aria builds
  // its input only in a real browser), so the press can't be simulated here.

  it('Send to Ver hoy delegates when a selection exists', () => {
    const onSendToVerHoy = vi.fn();
    mockHook({
      sections: { sinVer: [created('a', 'anime-a', 'Sin ver')], verHoy: [], visto: [] },
      selected: new Set(['anime-a']),
      onSendToVerHoy,
    });
    render(<DailyBoard />);
    fireEvent.click(screen.getByRole('button', { name: 'Send to Ver hoy' }));
    expect(onSendToVerHoy).toHaveBeenCalled();
  });

  it('renders the read-only Ver hoy and Visto groups', () => {
    mockHook({
      sections: {
        sinVer: [],
        verHoy: [created('b', 'anime-b', 'Ver hoy')],
        visto: [created('c', 'anime-c', 'Visto')],
      },
    });
    render(<DailyBoard />);
    expect(screen.getByText(/Ver hoy — watching/)).toBeInTheDocument();
    expect(screen.getByText(/Visto — watched/)).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('re-check now triggers a recheck', () => {
    const onRecheck = vi.fn();
    mockHook({ onRecheck });
    render(<DailyBoard />);
    fireEvent.click(screen.getByRole('button', { name: 'Re-check now' }));
    expect(onRecheck).toHaveBeenCalled();
  });
});
