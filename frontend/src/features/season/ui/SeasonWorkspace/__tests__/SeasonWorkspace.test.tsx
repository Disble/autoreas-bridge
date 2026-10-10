import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SeasonWorkspace } from '../SeasonWorkspace';
import { useSeasonWorkspace } from '../use-season-workspace';

vi.mock('../use-season-workspace', () => ({
  useSeasonWorkspace: vi.fn(),
}));

vi.mock('../../IntakePanel/IntakePanel', () => ({
  IntakePanel: () => <div>intake panel</div>,
}));

vi.mock('../../DailyBoard/DailyBoard', () => ({
  DailyBoard: () => <div>daily board</div>,
}));

vi.mock('../../EvaluationPanel/EvaluationPanel', () => ({
  EvaluationPanel: (props: { readonly onNavigate: (section: string) => void }) => (
    <button onClick={() => props.onNavigate('intake')}>evaluation panel</button>
  ),
}));

vi.mock('../../SelectionBoard/SelectionBoard', () => ({
  SelectionBoard: (props: { readonly onNavigate: (section: string) => void }) => (
    <button onClick={() => props.onNavigate('evaluation')}>selection board</button>
  ),
}));

vi.mock('../../OrderingBoard/OrderingBoard', () => ({
  OrderingBoard: (props: { readonly onNavigate: (section: string) => void }) => (
    <button onClick={() => props.onNavigate('selection')}>ordering board</button>
  ),
}));

vi.mock('../../OverviewPanel/OverviewPanel', () => ({
  OverviewPanel: (props: { readonly onNavigate: (section: string) => void }) => (
    <button onClick={() => props.onNavigate('intake')}>overview panel</button>
  ),
}));

/** Mocked hook each case drives to one workspace state. */
const mockedUseSeasonWorkspace = vi.mocked(useSeasonWorkspace);
/** Shape of the hook's return value, so a case can override only what it exercises. */
type HookReturn = ReturnType<typeof useSeasonWorkspace>;

/** The open season and its overview view model. */
const OPEN_SEASON: Partial<HookReturn> = {
  season: { id: 'season-1', name: 'Julio 2026', minApprovalGrade: 4, slots: 12, status: 'open', createdAt: Date.UTC(2026, 6, 6) },
  overview: { title: 'Julio 2026', statusLabel: 'Open', statusColor: 'success', createdLabel: 'July 6, 2026', minApprovalGrade: 4, slots: 12 },
};

/** A past season viewed read-only, and its overview view model. */
const PAST_SEASON: Partial<HookReturn> = {
  readOnly: true,
  season: { id: 's-old', name: 'Abril 2026', minApprovalGrade: 4, slots: 12, status: 'closed', createdAt: Date.UTC(2026, 3, 6) },
  overview: { title: 'Abril 2026', statusLabel: 'Closed', statusColor: 'default', createdLabel: 'April 6, 2026', minApprovalGrade: 4, slots: 12 },
};

/** The section tabs the shell renders. */
const SECTIONS: HookReturn['sections'] = [
  { id: 'overview', label: 'Overview', available: true },
  { id: 'intake', label: 'Intake & Daily', available: true },
  { id: 'evaluation', label: 'Evaluation', available: true },
  { id: 'selection', label: 'Selection', available: true },
  { id: 'ordering', label: 'Ordering', available: true },
];

/** Stubs the hook with an idle no-season state, overriding only the fields a case sets. */
function mockHook(overrides: Partial<HookReturn> = {}): void {
  mockedUseSeasonWorkspace.mockReturnValue({
    season: null,
    isLoading: false,
    errorMessage: undefined,
    readOnly: false,
    overview: null,
    sections: SECTIONS,
    activeTab: 'overview',
    selectTab: vi.fn(),
    suggestedName: 'Julio 2026',
    pastSeasonEntries: [],
    onCreateSeason: vi.fn(),
    onCloseSeason: vi.fn(),
    onViewPastSeason: vi.fn(),
    onExitPastSeason: vi.fn(),
    ...overrides,
  });
}

describe('SeasonWorkspace', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the empty state with the suggested name prefilled', () => {
    mockHook();
    render(<SeasonWorkspace />);

    expect(screen.getByText('No open season')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Julio 2026')).toBeInTheDocument();
  });

  it('submitting the create form calls onCreateSeason with the entered name', () => {
    const onCreateSeason = vi.fn();
    mockHook({ onCreateSeason });
    render(<SeasonWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: 'Create season' }));

    expect(onCreateSeason).toHaveBeenCalledWith('Julio 2026');
  });

  it('renders the overview and section tabs for an open season', () => {
    mockHook(OPEN_SEASON);
    render(<SeasonWorkspace />);

    expect(screen.getByRole('heading', { name: 'Julio 2026' })).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('overview panel')).toBeInTheDocument();
    expect(screen.getByText('Selection')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close season' })).toBeInTheDocument();
  });

  it('shows the hook-selected panel and delegates tab selection to the hook', () => {
    const selectTab = vi.fn();
    mockHook({ ...OPEN_SEASON, activeTab: 'selection', selectTab });
    render(<SeasonWorkspace />);

    expect(screen.getByText('selection board')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Evaluation' }));
    expect(selectTab).toHaveBeenCalledWith('evaluation');
  });

  it('passes the hook tab selector to Overview, Evaluation, Selection and Ordering navigation actions', () => {
    const selectTab = vi.fn();
    mockHook({ ...OPEN_SEASON, activeTab: 'overview', selectTab });
    const { rerender } = render(<SeasonWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'overview panel' }));
    expect(selectTab).toHaveBeenCalledWith('intake');

    mockHook({ ...OPEN_SEASON, activeTab: 'evaluation', selectTab });
    rerender(<SeasonWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'evaluation panel' }));
    expect(selectTab).toHaveBeenCalledTimes(2);
    expect(selectTab).toHaveBeenLastCalledWith('intake');

    mockHook({ ...OPEN_SEASON, activeTab: 'selection', selectTab });
    rerender(<SeasonWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'selection board' }));
    expect(selectTab).toHaveBeenCalledWith('evaluation');

    mockHook({ ...OPEN_SEASON, activeTab: 'ordering', selectTab });
    rerender(<SeasonWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'ordering board' }));
    expect(selectTab).toHaveBeenCalledWith('selection');
  });

  it('close season delegates to the hook callback', () => {
    const onCloseSeason = vi.fn();
    mockHook({ ...OPEN_SEASON, onCloseSeason });
    render(<SeasonWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: 'Close season' }));
    expect(onCloseSeason).toHaveBeenCalled();
  });

  it('lists past seasons and opens one on click when no season is open', () => {
    const onViewPastSeason = vi.fn();
    mockHook({
      pastSeasonEntries: [
        { id: 's-old', name: 'Abril 2026', statusLabel: 'Closed', statusColor: 'default', createdLabel: 'April 6, 2026' },
      ],
      onViewPastSeason,
    });
    render(<SeasonWorkspace />);

    expect(screen.getByText('Past seasons')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Abril 2026/ }));
    expect(onViewPastSeason).toHaveBeenCalledWith('s-old');
  });

  it('shows the Closed chip, a muted read-only line and a back button (and hides Close season) for a past season', () => {
    const onExitPastSeason = vi.fn();
    mockHook({ ...PAST_SEASON, onExitPastSeason });
    render(<SeasonWorkspace />);

    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByText('Read-only — editing is disabled.')).toBeInTheDocument();
    expect(screen.queryByText('Read-only')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close season' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Season mode/)).toBeNull();
    expect(screen.queryByRole('region', { name: 'Season' })).toBeNull();
    expect(screen.getByText('overview panel')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to history' }));
    expect(onExitPastSeason).toHaveBeenCalled();
  });

  it('puts the season facts, the season-mode explanation and Close season in one Overview season card', () => {
    mockHook(OPEN_SEASON);
    render(<SeasonWorkspace />);

    const card = screen.getByRole('region', { name: 'Season' });
    expect(within(card).getByText('July 6, 2026')).toBeInTheDocument();
    expect(within(card).getByText('Minimum approval grade').nextSibling).toHaveTextContent('4');
    expect(within(card).getByText('Slots').nextSibling).toHaveTextContent('12');
    expect(within(card).getByText('Season mode stays on until you close the season.')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Close season' })).toBeInTheDocument();
    expect(screen.queryByText('Read-only — editing is disabled.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back to history' })).toBeNull();
  });

  it('shows only the loading status while the season loads', () => {
    mockHook({ ...OPEN_SEASON, isLoading: true });
    render(<SeasonWorkspace />);

    expect(screen.getByRole('status', { name: 'Loading season' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Season' })).toBeNull();
    expect(screen.queryByText('overview panel')).toBeNull();
  });

  it.each([
    { name: 'a trimmed typed name', typed: '  Agosto 2026  ', want: 'Agosto 2026' },
    { name: 'the suggested name for a blank one', typed: '   ', want: 'Julio 2026' },
  ])('creates the season with $name', ({ typed, want }) => {
    const onCreateSeason = vi.fn();
    mockHook({ onCreateSeason });
    render(<SeasonWorkspace />);

    fireEvent.change(screen.getByDisplayValue('Julio 2026'), { target: { value: typed } });
    fireEvent.click(screen.getByRole('button', { name: 'Create season' }));

    expect(onCreateSeason).toHaveBeenCalledWith(want);
  });

  it('renders an error alert when the hook returns an error message', () => {
    mockHook({ errorMessage: 'a season is already open' });
    render(<SeasonWorkspace />);

    expect(screen.getByText('a season is already open')).toBeInTheDocument();
  });
});
