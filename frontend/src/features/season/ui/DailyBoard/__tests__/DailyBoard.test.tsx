import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source/season-source.types';
import { DailyBoard } from '../DailyBoard';
import { useDailyBoard } from '../use-daily-board';

vi.mock('../use-daily-board', () => ({
  useDailyBoard: vi.fn(),
}));

/** The mocked `useDailyBoard` hook the board renders from. */
const mockedUseDailyBoard = vi.mocked(useDailyBoard);
/** The view model `useDailyBoard` returns. */
type HookReturn = ReturnType<typeof useDailyBoard>;

/** Builds a created season row in the given section. */
function created(id: string, animeId: string, section: string, sectionOrder = 0): SeasonAnimeRow {
  return {
    id,
    rawName: id.toUpperCase(),
    matchStatus: 'matched',
    matchedSlug: 'x',
    candidates: [],
    availability: 'created', availableEpisodes: 0,
    animeId,
    section,
    sectionOrder,
    grade: 0,
    gradeSource: '',
    skipGrading: false,
    consideration: 'none',  };
}

/** Stubs `useDailyBoard` with an empty, editable board plus the given overrides. */
function mockHook(overrides: Partial<HookReturn> = {}): HookReturn {
  const value: HookReturn = {
    readOnly: false,
    sections: { sinVer: [], verHoy: [], visto: [] },
    selected: new Set<string>(),
    toggleSelect: vi.fn(),
    onSendToVerHoy: vi.fn(),
    downloadNotice: null,
    onDownloadNow: vi.fn(),
    onDismissNotice: vi.fn(),
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

  // The real checkbox rendering + click → selection wiring is covered by the
  // integration test in DailyBoard.checkbox.test.tsx (real hook, real Checkbox).
  // These cases mock the hook to assert the surrounding layout in isolation.

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

  it('shows a scheduled-day chip on graduated Visto rows only', () => {
    mockHook({
      sections: {
        sinVer: [],
        verHoy: [],
        visto: [created('c', 'anime-c', 'Visto'), created('d', 'anime-d', 'Domingo', 2)],
      },
    });
    render(<DailyBoard />);
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();
    expect(screen.getByText('Domingo - 2')).toBeInTheDocument();
    expect(screen.queryByText('Visto', { exact: true })).not.toBeInTheDocument();
  });

  it('re-check now triggers a recheck', () => {
    const onRecheck = vi.fn();
    mockHook({ onRecheck });
    render(<DailyBoard />);
    fireEvent.click(screen.getByRole('button', { name: 'Re-check now' }));
    expect(onRecheck).toHaveBeenCalled();
  });

  it('shows episode count and an open-page link for a Sin-ver row', () => {
    const row = created('a', 'anime-a', 'Sin ver');
    mockHook({ sections: { sinVer: [{ ...row, availableEpisodes: 5, matchedSlug: 'https://example.com/a' }], verHoy: [], visto: [] } });
    render(<DailyBoard />);
    expect(screen.getByText('5 episodes available')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open the page for A/ })).toBeInTheDocument();
  });

  it('does not render an open-page link when the Sin-ver row has no matched slug', () => {
    const row = created('a', 'anime-a', 'Sin ver');
    mockHook({ sections: { sinVer: [{ ...row, availableEpisodes: 0, matchedSlug: '' }], verHoy: [], visto: [] } });
    render(<DailyBoard />);
    expect(screen.getByText('0 episodes available')).toBeInTheDocument();
    // Query by label: an anchor rendered with an empty href has no link role, so a role query could never see it.
    expect(screen.queryByLabelText(/Open the page for A/)).not.toBeInTheDocument();
  });

  // The availability dot belongs to the Intake list only; in Sin ver it duplicated the episode text.
  it.each([
    { availableEpisodes: 5, text: '5 episodes available', dotLabel: '5 episodes available' },
    { availableEpisodes: 0, text: '0 episodes available', dotLabel: 'No episodes online yet' },
  ])('renders no availability dot for a Sin-ver row with $availableEpisodes episodes', ({ availableEpisodes, text, dotLabel }) => {
    const row = created('a', 'anime-a', 'Sin ver');
    mockHook({ sections: { sinVer: [{ ...row, availableEpisodes }], verHoy: [], visto: [] } });
    render(<DailyBoard />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByLabelText(dotLabel)).not.toBeInTheDocument();
  });
});
