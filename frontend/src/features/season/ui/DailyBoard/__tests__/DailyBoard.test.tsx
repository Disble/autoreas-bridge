import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

/** The Sin ver section heading. */
const SIN_VER_HEADING = 'Sin ver — pick what you watch today';
/** The Ver hoy section heading. */
const VER_HOY_HEADING = 'Ver hoy — watching (drains as you watch)';
/** The Visto section heading. */
const VISTO_HEADING = 'Visto — watched, ready for evaluation';

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
    getCoverThumb: vi.fn(() => ({ coverSrc: undefined, isLoading: false })),
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

  it('renders every Ver hoy row in board order with its count and scheduled-day chip', () => {
    mockHook({ sections: { sinVer: [], verHoy: [created('b', 'anime-b', 'Ver hoy'), created('e', 'anime-e', 'Jueves', 3)], visto: [] } });
    render(<DailyBoard />);
    const items = within(screen.getByRole('list', { name: 'Ver hoy' })).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['B', 'EJueves - 3']);
    // Elements per row: the cover thumb and the name, plus the chip only when a day is scheduled.
    expect(items.map((item) => item.children.length)).toEqual([2, 3]);
    expect(within(items[1]).getByText('E')).toHaveAttribute('title', 'E');
    expect(screen.getByRole('heading', { level: 3, name: VER_HOY_HEADING }).parentElement).toHaveTextContent(`${VER_HOY_HEADING}2`);
  });

  it('renders every Visto row at once, in board order, with its grade state and no weekday chip', () => {
    const visto = [
      { ...created('g', 'anime-g', 'Jueves', 3), grade: 4 },
      { ...created('s', 'anime-s', 'Visto'), skipGrading: true },
      created('n', 'anime-n', 'Domingo', 2),
      { ...created('o', 'anime-o', 'Visto'), grade: 1, skipGrading: true },
    ];
    mockHook({ sections: { sinVer: [], verHoy: [], visto } });
    render(<DailyBoard />);
    const items = within(screen.getByRole('list', { name: 'Visto' })).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['GGrade 4', 'SSkipped', 'NNo grade', 'OGrade 1']);
    expect(items.map((item) => item.children.length)).toEqual([3, 3, 3, 3]);
    expect(within(items[2]).getByText('N')).toHaveAttribute('title', 'N');
    expect(screen.getByRole('heading', { level: 3, name: VISTO_HEADING }).parentElement).toHaveTextContent(`${VISTO_HEADING}4`);
    expect(screen.queryByRole('button', { name: /Visto/ })).not.toBeInTheDocument();
  });

  it('renders nothing below the intake in an open season with no created animes', () => {
    mockHook();
    const { container } = render(<DailyBoard />);
    expect(container.querySelector('[data-slot="card"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Re-check now' })).not.toBeInTheDocument();
  });

  it.each([
    { section: 'sinVer', title: SIN_VER_HEADING },
    { section: 'verHoy', title: VER_HOY_HEADING },
    { section: 'visto', title: VISTO_HEADING },
  ] as const)('shows only the $section card in an open season once it holds an anime, with Re-check now', ({ section, title }) => {
    mockHook({ sections: { sinVer: [], verHoy: [], visto: [], [section]: [created('a', 'anime-a', 'Visto')] } });
    render(<DailyBoard />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([title]);
    expect(screen.getByRole('button', { name: 'Re-check now' })).toBeInTheDocument();
  });

  it('shows all three cards in a read-only season, each empty one with its compact empty state', () => {
    mockHook({ readOnly: true });
    const { container } = render(<DailyBoard />);
    const cards = [...container.querySelectorAll('[data-slot="card"]')];
    expect(cards.map((card) => [...card.querySelectorAll('h3')].map((heading) => heading.textContent))).toEqual([
      [SIN_VER_HEADING, 'Nothing left to schedule.'],
      [VER_HOY_HEADING, 'Nothing being watched.'],
      [VISTO_HEADING, 'Nothing watched yet.'],
    ]);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders every section as one card pattern: title, count chip, description, then content', () => {
    mockHook({
      readOnly: true,
      sections: { sinVer: [created('a', 'anime-a', 'Sin ver')], verHoy: [created('b', 'anime-b', 'Ver hoy')], visto: [created('c', 'anime-c', 'Visto')] },
    });
    const { container } = render(<DailyBoard />);
    const cards = [...container.querySelectorAll('[data-slot="card"]')];
    expect(
      cards.map((card) => [
        card.querySelector('[data-slot="card-header"]')?.querySelector('h3')?.parentElement?.textContent,
        card.querySelector('[data-slot="card-description"]') !== null,
        card.querySelector('[data-slot="card-content"] ul')?.getAttribute('aria-label'),
      ]),
    ).toEqual([
      [`${SIN_VER_HEADING}1`, true, 'Sin ver'],
      [`${VER_HOY_HEADING}1`, true, 'Ver hoy'],
      [`${VISTO_HEADING}1`, true, 'Visto'],
    ]);
  });

  it('re-check now triggers a recheck', () => {
    const onRecheck = vi.fn();
    mockHook({ onRecheck, sections: { sinVer: [created('a', 'anime-a', 'Sin ver')], verHoy: [], visto: [] } });
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

  it('renders each Sin ver, Ver hoy and Visto row its own cover thumbnail', () => {
    const getCoverThumb = vi.fn((animeId: string) => ({ coverSrc: `data:${animeId}`, isLoading: false }));
    mockHook({
      sections: {
        sinVer: [created('a', 'anime-a', 'Sin ver')],
        verHoy: [created('b', 'anime-b', 'Ver hoy')],
        visto: [created('c', 'anime-c', 'Visto')],
      },
      getCoverThumb,
    });
    render(<DailyBoard />);

    /** The list row that renders the given anime name. */
    const rowOf = (name: string) => screen.getByText(name).closest('li') as HTMLElement;
    expect(within(rowOf('A')).getByTestId('season-cover-thumb-image')).toHaveAttribute('src', 'data:anime-a');
    expect(within(rowOf('B')).getByTestId('season-cover-thumb-image')).toHaveAttribute('src', 'data:anime-b');
    expect(within(rowOf('C')).getByTestId('season-cover-thumb-image')).toHaveAttribute('src', 'data:anime-c');
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
