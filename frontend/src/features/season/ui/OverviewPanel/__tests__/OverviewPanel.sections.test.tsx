import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CHART_SURFACE, OVERVIEW_LINEUP_COPY, OVERVIEW_LINEUP_LOADING_LABEL, SELECTION_OUTCOME_CHART_COLORS, SELECTION_OUTCOME_EMPTY_MESSAGE, SELECTION_OUTCOME_KEYS } from '../overview-panel.constants';
import type { OverviewLineupView, SelectionOutcomeDatum } from '../overview-panel.types';
import { OverviewFinalLineup } from '../OverviewFinalLineup';
import { useOverviewLineup } from '../use-overview-lineup';
import { SelectionOutcomeChart } from '../SelectionOutcomeChart';

vi.mock('../use-overview-lineup', () => ({ useOverviewLineup: vi.fn() }));

/** Mocked hook each case drives to one lineup state. */
const mockedUseOverviewLineup = vi.mocked(useOverviewLineup);

/** A two-day recorded lineup: one graded anime, one without a grade. */
const LINEUP: OverviewLineupView = {
  display: 'lineup',
  errorMessage: undefined,
  summary: '2 animes, as scheduled when the season closed',
  days: [
    { day: 'Lunes', items: [{ key: 'Lunes-a', animeId: 'a', name: 'Sayonara Lara', grade: 6 }] },
    { day: 'Domingo', items: [{ key: 'Domingo-b', animeId: 'b', name: 'Yani Neko', grade: null }] },
  ],
};

/** Renders the lineup card with the hook returning the given view. */
function renderWith(view: Partial<OverviewLineupView>) {
  mockedUseOverviewLineup.mockReturnValue({
    view: { display: 'loading', errorMessage: undefined, summary: '', days: [], ...view },
    getCoverThumb: () => ({ coverSrc: undefined, isLoading: false }),
  });
  render(<OverviewFinalLineup />);
}

/** Names every display state whose marker is on screen, so a case can prove exactly one renders. */
function visibleStates(): string[] {
  const markers = {
    loading: screen.queryByRole('status', { name: OVERVIEW_LINEUP_LOADING_LABEL }),
    failed: document.querySelector('[data-slot="alert-root"]'),
    unrecorded: screen.queryByText(OVERVIEW_LINEUP_COPY.notRecordedTitle),
    empty: screen.queryByText(OVERVIEW_LINEUP_COPY.emptyTitle),
    lineup: screen.queryByRole('region', { name: OVERVIEW_LINEUP_COPY.regionLabel }),
  };
  return Object.entries(markers)
    .filter(([, marker]) => marker !== null)
    .map(([state]) => state);
}

describe('OverviewFinalLineup', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each([
    { view: { display: 'loading' as const }, want: ['loading'] },
    { view: { display: 'failed' as const, errorMessage: 'boom' }, want: ['failed'] },
    { view: { display: 'unrecorded' as const }, want: ['unrecorded'] },
    { view: { display: 'empty' as const }, want: ['empty'] },
    { view: LINEUP, want: ['lineup'] },
  ])('renders exactly one state for $view.display', ({ view, want }) => {
    renderWith(view);

    expect(visibleStates()).toEqual(want);
  });

  it.each([
    { display: 'unrecorded' as const, kind: 'caught-up' },
    { display: 'empty' as const, kind: 'waiting-on-step' },
  ])('draws the $display lineup as a $kind row', ({ display, kind }) => {
    renderWith({ display });

    expect(document.querySelector(`[data-airis-icon="${kind}"]`)).not.toBeNull();
  });

  it('shows the read failure message', () => {
    renderWith({ display: 'failed', errorMessage: 'boom' });

    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('lists the recorded lineup per weekday with covers, names and season grades', () => {
    renderWith(LINEUP);

    expect(screen.getByText('2 animes, as scheduled when the season closed')).toBeInTheDocument();
    const monday = screen.getByRole('list', { name: 'Lunes' });
    expect(within(monday).getByText('Sayonara Lara')).toBeInTheDocument();
    expect(within(monday).getByLabelText('Approval grade 6')).toHaveTextContent('6');
    expect(within(monday).getByTestId('season-cover-thumb')).toBeInTheDocument();
    const sunday = screen.getByRole('list', { name: 'Domingo' });
    expect(within(sunday).getByText('Yani Neko')).toBeInTheDocument();
    expect(within(sunday).queryByLabelText(/Approval grade/)).toBeNull();
    expect(within(sunday).getByText('No grade')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

/** Captured props of the last ResponsiveBar render, so each case can read what the chart sent. */
const barProps = vi.hoisted(() => ({ current: undefined as Record<string, unknown> | undefined }));

vi.mock('@nivo/bar', () => ({
  ResponsiveBar: (props: Record<string, unknown>) => {
    barProps.current = props;
    return <div data-testid="nivo-bar" />;
  },
}));

/** Builds the single stacked datum the chart renders. */
function datum(overrides: Partial<SelectionOutcomeDatum> = {}): SelectionOutcomeDatum {
  return { dim: 'outcome', Approved: 2, Rejected: 1, 'No grade': 1, ...overrides };
}

describe('SelectionOutcomeChart', () => {
  afterEach(() => {
    cleanup();
    barProps.current = undefined;
  });

  it('shows the resolved-empty message instead of a chart while nothing has been created', () => {
    render(<SelectionOutcomeChart data={[]} keys={SELECTION_OUTCOME_KEYS} hasCreated={false} />);

    expect(screen.getByText(SELECTION_OUTCOME_EMPTY_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByTestId('nivo-bar')).toBeNull();
  });

  it('sends the three buckets, their keys and the stack total to the bar', () => {
    const data = [datum()];
    render(<SelectionOutcomeChart data={data} keys={SELECTION_OUTCOME_KEYS} hasCreated />);

    const props = barProps.current;
    expect(props?.data).toEqual(data);
    expect(props?.keys).toEqual([...SELECTION_OUTCOME_KEYS]);
    expect(props?.layout).toBe('horizontal');
    // The axis max is pinned to the true stack total so a part-to-whole bar fills
    // its track instead of leaving a dead gap after the last segment.
    expect(props?.valueScale).toEqual({ type: 'linear', min: 0, max: 4 });
    expect(props?.axisBottom).toEqual({ tickValues: [0, 1, 2, 3, 4] });
    // Bars carry no inner labels and no horizontal gridlines, and the margin leaves
    // the bottom band the legend row needs — all three are deliberate, not defaults.
    expect(props?.enableLabel).toBe(false);
    expect(props?.enableGridY).toBe(false);
    expect(props?.margin).toEqual({ top: 8, right: 8, bottom: 72, left: 8 });
  });

  it('labels each segment with its bucket and count', () => {
    render(<SelectionOutcomeChart data={[datum()]} keys={SELECTION_OUTCOME_KEYS} hasCreated />);

    const tooltipLabel = barProps.current?.tooltipLabel as (datum: { id: string; value: number }) => string;
    expect(tooltipLabel({ id: 'Approved', value: 2 })).toBe('Approved: 2');
  });

  it('colors a segment by its bucket label and falls back to the chart surface for an unknown one', () => {
    render(<SelectionOutcomeChart data={[datum()]} keys={SELECTION_OUTCOME_KEYS} hasCreated />);

    const colors = barProps.current?.colors as (bar: { id: string | number }) => string;
    expect(colors({ id: 'Approved' })).toBe(SELECTION_OUTCOME_CHART_COLORS.Approved);
    expect(colors({ id: 'Rejected' })).toBe(SELECTION_OUTCOME_CHART_COLORS.Rejected);
    expect(colors({ id: 'No grade' })).toBe(SELECTION_OUTCOME_CHART_COLORS['No grade']);
    expect(colors({ id: 'something else' })).toBe(CHART_SURFACE);
  });

  it('keeps the legend as the second identification channel for the neutral segment', () => {
    render(<SelectionOutcomeChart data={[datum()]} keys={SELECTION_OUTCOME_KEYS} hasCreated />);

    const legends = barProps.current?.legends as readonly { dataFrom: string; anchor: string; direction: string; itemWidth: number }[];
    expect(legends).toHaveLength(1);
    expect(legends[0]?.dataFrom).toBe('keys');
    expect(legends[0]?.anchor).toBe('bottom');
    expect(legends[0]?.direction).toBe('row');
    // Narrow enough for three buckets to sit on one legend row.
    expect(legends[0]?.itemWidth).toBe(96);
  });
});
