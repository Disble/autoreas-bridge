import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OverviewPanelViewModel } from '../overview-panel.types';
import { OverviewPanel } from '../OverviewPanel';
import { useOverviewPanel } from '../use-overview-panel';

vi.mock('../use-overview-panel', () => ({ useOverviewPanel: vi.fn() }));
vi.mock('@nivo/bar', () => ({ ResponsiveBar: () => <div data-testid="nivo-bar" /> }));
vi.mock('../OverviewFinalLineup', () => ({ OverviewFinalLineup: () => <div>final lineup</div> }));

/** Mocked hook the panel tests drive directly, so each case renders one overview state. */
const mockedUseOverviewPanel = vi.mocked(useOverviewPanel);
/** Shape of the hook's return value, so a case can override only what it exercises. */
type HookReturn = ReturnType<typeof useOverviewPanel>;

/** Builds a complete overview view model the panel can render without a live season. */
function baseViewModel(): OverviewPanelViewModel {
  return {
    kpi: { intakeTotal: 10, createdCount: 6, ratedCount: 5, ratedTotal: 6, approvedCount: 3, slots: 12 },
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
    selectionOutcome: [{ dim: 'outcome', Approved: 3, Rejected: 2, 'No grade': 1 }],
    selectionOutcomeKeys: ['Approved', 'Rejected', 'No grade'],
    hasCreated: true,
    hasIntake: true,
    hasGrades: true,
  };
}

/** Renders the panel with a stubbed hook, overriding only the fields a case sets. */
function mockHook(overrides: Partial<HookReturn> = {}): HookReturn {
  const value: HookReturn = {
    readOnly: false,
    errorMessage: undefined,
    outcomeSteps: [
      { label: 'Intake', value: '10', suffix: '' },
      { label: 'Approved', value: '3', suffix: '/ 12 slots' },
    ],
    outcomeMeta: 'Created July 8, 2026 · Minimum approval grade 4',
    ...baseViewModel(),
    ...overrides,
  };
  mockedUseOverviewPanel.mockReturnValue(value);
  return value;
}

/** Renders the panel under the stubbed hook. */
function renderPanel() {
  return render(<OverviewPanel />);
}

describe('OverviewPanel', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the four KPI values', () => {
    mockHook();
    renderPanel();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText(/5\s*\/\s*6/)).toBeInTheDocument();
    expect(screen.getAllByText(/3\s*\/\s*12/).length).toBeGreaterThan(0);
  });

  it('renders a nivo-bar chart for each of pipeline, intake health, grade histogram, and selection outcome when data exists', () => {
    mockHook();
    renderPanel();
    expect(screen.getAllByTestId('nivo-bar')).toHaveLength(4);
    expect(screen.getByTestId('watching-pipeline-chart')).toBeInTheDocument();
    expect(screen.queryByText('final lineup')).toBeNull();
  });

  it('shows the pipeline empty state instead of a chart when hasCreated is false', () => {
    mockHook({ hasCreated: false, pipeline: [], selectionOutcome: [] });
    renderPanel();
    expect(screen.getAllByTestId('nivo-bar')).toHaveLength(2);
    expect(screen.getByText(/No created animes yet/)).toBeInTheDocument();
    expect(screen.queryByTestId('selection-outcome-chart')).toBeNull();
  });

  it('shows the selection outcome empty state instead of a chart when no candidate has been created', () => {
    mockHook({ hasCreated: false, pipeline: [], selectionOutcome: [] });
    renderPanel();
    expect(screen.getByText(/No created candidates yet/)).toBeInTheDocument();
  });

  it('shows the intake health empty state instead of a chart when hasIntake is false', () => {
    mockHook({ hasIntake: false, intakeHealth: [] });
    renderPanel();
    expect(screen.getAllByTestId('nivo-bar')).toHaveLength(3);
    expect(screen.getByText(/No intake rows yet/)).toBeInTheDocument();
  });

  it('shows the grade histogram empty state instead of a chart when hasGrades is false', () => {
    mockHook({ hasGrades: false });
    renderPanel();
    expect(screen.getAllByTestId('nivo-bar')).toHaveLength(3);
    expect(screen.getByText(/No graded animes yet/)).toBeInTheDocument();
  });

  it('replaces the slots meter with the selection outcome breakdown and states that an ungraded candidate is applied as rejected', () => {
    mockHook();
    renderPanel();
    expect(screen.getByText('Selection outcome')).toBeInTheDocument();
    expect(screen.getByTestId('selection-outcome-chart')).toBeInTheDocument();
    // The visible copy carries the rule that the replaced meter never surfaced.
    expect(screen.getByText(/no grade counts as rejected/)).toBeInTheDocument();
    expect(screen.queryByTestId('slots-meter')).toBeNull();
    // The third bucket is labelled without implying pending work: this panel also
    // renders a closed season, whose confirmation already applied its verdicts.
    expect(screen.queryByText(/Not yet graded/)).toBeNull();
  });

  it.each([false, true])('shows the store error alert (readOnly %s)', (readOnly) => {
    mockHook({ readOnly, errorMessage: 'season read failed' });
    renderPanel();
    expect(screen.getByText('season read failed')).toBeInTheDocument();
  });

  it('renders no mutating control when readOnly is true', () => {
    mockHook({ readOnly: true });
    renderPanel();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('answers what a closed season produced: funnel, histogram, selection outcome and final lineup', () => {
    mockHook({ readOnly: true });
    renderPanel();

    const funnel = screen.getByRole('region', { name: 'Season outcome' });
    expect(within(funnel).getAllByRole('listitem').map((step) => step.textContent)).toEqual(['Intake10', 'Approved3/ 12 slots']);
    expect(within(funnel).getByText('Created July 8, 2026 · Minimum approval grade 4')).toBeInTheDocument();
    expect(screen.getByTestId('grade-histogram-chart')).toBeInTheDocument();
    expect(screen.getByTestId('selection-outcome-chart')).toBeInTheDocument();
    expect(screen.getByText('final lineup')).toBeInTheDocument();
  });

  it('never shows a closed season the live watching pipeline, the intake health or the KPI tiles', () => {
    mockHook({ readOnly: true });
    renderPanel();

    expect(screen.getAllByTestId('nivo-bar')).toHaveLength(2);
    expect(screen.queryByText('Watching pipeline')).toBeNull();
    expect(screen.queryByText('Intake health')).toBeNull();
    expect(screen.queryByText('Intake rows total')).toBeNull();
  });

  it('keeps the open season free of the closed-season funnel', () => {
    mockHook();
    renderPanel();

    expect(screen.queryByRole('region', { name: 'Season outcome' })).toBeNull();
    expect(screen.getByText('Intake rows total')).toBeInTheDocument();
  });
});
