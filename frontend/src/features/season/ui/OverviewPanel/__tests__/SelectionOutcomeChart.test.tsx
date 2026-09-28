import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CHART_SURFACE,
  SELECTION_OUTCOME_CHART_COLORS,
  SELECTION_OUTCOME_EMPTY_MESSAGE,
  SELECTION_OUTCOME_KEYS,
} from '../overview-panel.constants';
import type { SelectionOutcomeDatum } from '../overview-panel.types';
import { SelectionOutcomeChart } from '../SelectionOutcomeChart';

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
