import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OverviewPanelViewModel } from '../overview-panel.types';
import { OverviewPanel } from '../OverviewPanel';
import { useOverviewPanel } from '../use-overview-panel';

vi.mock('../use-overview-panel', () => ({ useOverviewPanel: vi.fn() }));
vi.mock('@nivo/bar', () => ({ ResponsiveBar: () => <div data-testid="nivo-bar" /> }));

const mockedUseOverviewPanel = vi.mocked(useOverviewPanel);
type HookReturn = ReturnType<typeof useOverviewPanel>;

function baseViewModel(): OverviewPanelViewModel {
  return {
    kpi: { intakeTotal: 10, createdCount: 6, ratedCount: 6, ratedTotal: 6, approvedCount: 3, slots: 12 },
    pipeline: [{ stage: 'pipeline', 'Sin ver': 1, 'Ver hoy': 3, Visto: 2 }],
    pipelineKeys: ['Sin ver', 'Ver hoy', 'Visto'],
    intakeHealth: [{ dim: 'intake', pending: 2, matched: 3, ambiguous: 1, not_found: 1, discarded: 1 }],
    intakeHealthKeys: ['pending', 'matched', 'ambiguous', 'not_found', 'discarded'],
    gradeHistogram: [
      { grade: '1', count: 0, emphasis: false },
      { grade: '2', count: 0, emphasis: false },
      { grade: '3', count: 0, emphasis: false },
      { grade: '4', count: 2, emphasis: true },
      { grade: '5', count: 1, emphasis: true },
      { grade: '6', count: 1, emphasis: true },
    ],
    minApprovalGrade: 4,
    slotsMeter: { approved: 3, slots: 12, meterValue: 3, isOverQuota: false, status: 'under', color: 'accent', label: '3 / 12' },
    hasCreated: true,
    hasIntake: true,
    hasGrades: true,
  };
}

function mockHook(overrides: Partial<HookReturn> = {}): HookReturn {
  const value: HookReturn = {
    readOnly: false,
    errorMessage: undefined,
    ...baseViewModel(),
    ...overrides,
  };
  mockedUseOverviewPanel.mockReturnValue(value);
  return value;
}

describe('OverviewPanel', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the four KPI values', () => {
    mockHook();
    render(<OverviewPanel />);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText(/6\s*\/\s*6/)).toBeInTheDocument();
    expect(screen.getAllByText(/3\s*\/\s*12/).length).toBeGreaterThan(0);
  });

  it('renders a nivo-bar chart for each of pipeline, intake health, and grade histogram when data exists', () => {
    mockHook();
    render(<OverviewPanel />);
    expect(screen.getAllByTestId('nivo-bar')).toHaveLength(3);
  });

  it('shows the pipeline empty state instead of a chart when hasCreated is false', () => {
    mockHook({ hasCreated: false, pipeline: [] });
    render(<OverviewPanel />);
    expect(screen.getAllByTestId('nivo-bar')).toHaveLength(2);
    expect(screen.getByText(/No created animes yet/)).toBeInTheDocument();
  });

  it('shows the intake health empty state instead of a chart when hasIntake is false', () => {
    mockHook({ hasIntake: false, intakeHealth: [] });
    render(<OverviewPanel />);
    expect(screen.getAllByTestId('nivo-bar')).toHaveLength(2);
    expect(screen.getByText(/No intake rows yet/)).toBeInTheDocument();
  });

  it('shows the grade histogram empty state instead of a chart when hasGrades is false', () => {
    mockHook({ hasGrades: false });
    render(<OverviewPanel />);
    expect(screen.getAllByTestId('nivo-bar')).toHaveLength(2);
    expect(screen.getByText(/No graded animes yet/)).toBeInTheDocument();
  });

  it('shows the slots meter ratio and an explicit over-quota indicator, never a silent 14/12', () => {
    mockHook({
      slotsMeter: { approved: 14, slots: 12, meterValue: 12, isOverQuota: true, status: 'over', color: 'danger', label: '14 / 12 · Over quota' },
    });
    render(<OverviewPanel />);
    expect(screen.getAllByText(/14 \/ 12/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/over quota/i).length).toBeGreaterThan(0);
  });

  it('renders no mutating control when readOnly is true', () => {
    mockHook({ readOnly: true });
    render(<OverviewPanel />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });
});
