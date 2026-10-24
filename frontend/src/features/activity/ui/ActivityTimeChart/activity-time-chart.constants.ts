import type { ActivityChartBarState } from '../../feed/activity-feed.types';

/** Fill of a bar by selection state: blue activity, full accent inside a selection, faded outside it. */
export const ACTIVITY_BAR_FILL_CLASS: Readonly<Record<ActivityChartBarState, string>> = {
  idle: 'bg-[color-mix(in_oklab,var(--accent)_75%,var(--background))]',
  selected: 'bg-accent',
  dimmed: 'bg-[color-mix(in_oklab,var(--accent)_75%,var(--background))] opacity-35',
};

/** The slot behind a bar by selection state: a selected slot is tinted across its full height. */
export const ACTIVITY_BAR_SLOT_CLASS: Readonly<Record<ActivityChartBarState, string>> = {
  idle: 'hover:bg-default',
  selected: 'bg-accent/15',
  dimmed: 'hover:bg-default',
};

/** The now line beside the newest bar. */
export const ACTIVITY_BAR_NOW_CLASS = "before:absolute before:-top-1.5 before:-bottom-1.5 before:-right-[3px] before:w-0.5 before:rounded-sm before:bg-success before:content-['']";

/** Bar geometry by density: 4px apart with 6px corners, or 2px apart with 3px corners past 24 bars. */
export const ACTIVITY_CHART_DENSITY_CLASS = {
  bars: { sparse: 'gap-1', dense: 'gap-0.5' },
  bar: { sparse: 'rounded-md', dense: 'rounded-[3px]' },
  fill: { sparse: 'rounded-[5px]', dense: 'rounded-[3px]' },
  tick: { sparse: 'text-center', dense: 'text-left' },
  // The newest dense tick ("Today") ends at its bar instead of running past the chart.
  nowTick: { sparse: 'text-center', dense: 'flex justify-end' },
} as const;

/** Screen-reader label of the chart's loading region. */
export const ACTIVITY_CHART_LOADING_LABEL = 'Loading the activity chart';
