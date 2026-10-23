import type { ActivityChartBarState } from '../../feed/activity-feed.types';

/** Fill of a bar by selection state: blue activity, faded outside a selection. */
export const ACTIVITY_BAR_FILL_CLASS: Readonly<Record<ActivityChartBarState, string>> = {
  idle: 'bg-accent/75',
  selected: 'bg-accent',
  dimmed: 'bg-accent/25',
};

/** Screen-reader label of the chart's loading region. */
export const ACTIVITY_CHART_LOADING_LABEL = 'Loading the activity chart';
