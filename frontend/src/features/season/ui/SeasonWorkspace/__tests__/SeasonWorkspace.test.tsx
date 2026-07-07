import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  EvaluationPanel: () => <div>evaluation panel</div>,
}));

vi.mock('../../SelectionBoard/SelectionBoard', () => ({
  SelectionBoard: () => <div>selection board</div>,
}));

const mockedUseSeasonWorkspace = vi.mocked(useSeasonWorkspace);
type HookReturn = ReturnType<typeof useSeasonWorkspace>;

const SECTIONS: HookReturn['sections'] = [
  { id: 'overview', label: 'Overview', available: true },
  { id: 'intake', label: 'Intake & Daily', available: false },
  { id: 'evaluation', label: 'Evaluation', available: false },
  { id: 'selection', label: 'Selection', available: false },
  { id: 'ordering', label: 'Ordering', available: false },
];

function mockHook(overrides: Partial<HookReturn> = {}): void {
  mockedUseSeasonWorkspace.mockReturnValue({
    season: null,
    isLoading: false,
    errorMessage: undefined,
    overview: null,
    sections: SECTIONS,
    suggestedName: 'Julio 2026',
    onCreateSeason: vi.fn(),
    onCloseSeason: vi.fn(),
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
    mockHook({
      season: {
        id: 'season-1',
        name: 'Julio 2026',
        minApprovalGrade: 4,
        slots: 12,
        status: 'open',
        createdAt: Date.UTC(2026, 6, 6),
      },
      overview: {
        title: 'Julio 2026',
        statusLabel: 'Open',
        statusColor: 'success',
        createdLabel: 'July 6, 2026',
        minApprovalGrade: 4,
        slots: 12,
      },
    });
    render(<SeasonWorkspace />);

    expect(screen.getByRole('heading', { name: 'Julio 2026' })).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Selection')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close season' })).toBeInTheDocument();
  });

  it('close season delegates to the hook callback', () => {
    const onCloseSeason = vi.fn();
    mockHook({
      season: {
        id: 'season-1',
        name: 'Julio 2026',
        minApprovalGrade: 4,
        slots: 12,
        status: 'open',
        createdAt: Date.UTC(2026, 6, 6),
      },
      overview: {
        title: 'Julio 2026',
        statusLabel: 'Open',
        statusColor: 'success',
        createdLabel: 'July 6, 2026',
        minApprovalGrade: 4,
        slots: 12,
      },
      onCloseSeason,
    });
    render(<SeasonWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: 'Close season' }));
    expect(onCloseSeason).toHaveBeenCalled();
  });

  it('renders an error alert when the hook returns an error message', () => {
    mockHook({ errorMessage: 'a season is already open' });
    render(<SeasonWorkspace />);

    expect(screen.getByText('a season is already open')).toBeInTheDocument();
  });
});
