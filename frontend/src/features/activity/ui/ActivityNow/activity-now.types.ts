import type { ActivityIncidentSummary, ActivityNowView } from '../../activity-source/activity.types';

/** One bar of the 24-hour chart, ready to draw. */
export interface ActivityHourBarModel {
  /** Hour start, stable React key. */
  readonly key: number;
  /** Local hour, `17:00`. */
  readonly label: string;
  /** No rollup row for the hour: drawn dashed, never as zero. */
  readonly isGap: boolean;
  /** Bar height relative to the busiest hour, 0-100. */
  readonly heightPercent: number;
  /** Share of the bar drawn as failed, 0-100. */
  readonly failedPercent: number;
  /** Hover text with the hour's numbers. */
  readonly title: string;
}

/** The Now request as the tab renders it: loading, failed, or resolved. */
export type ActivityNowState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly view: ActivityNowView; readonly readAtMs: number };

/** One of the three figures beside the status sentence. */
export interface ActivityFigureModel {
  /** Figure label, stable React key. */
  readonly label: string;
  /** Formatted value, `1,912`. */
  readonly value: string;
}

/** One "Recent changes" row in plain words. */
export interface ActivityChangeModel {
  /** Domain-history row id, stable React key. */
  readonly key: number;
  /** Anime title, as stored. */
  readonly animeName: string;
  /** What changed and who changed it, `episode 10 → 11 · from the phone`. */
  readonly description: string;
}

/** The resolved Now view, worded and scaled for the dumb components. */
export interface ActivityNowModel {
  /** Status dot fill. */
  readonly statusDotClass: string;
  /** Status sentence, worded by Go. */
  readonly sentence: string;
  /** Last contact and uptime line. */
  readonly contactLine: string;
  /** Requests today, open incidents and changes today, formatted. */
  readonly figures: readonly ActivityFigureModel[];
  /** The 24 drawable bars, oldest first. */
  readonly bars: readonly ActivityHourBarModel[];
  /** Text alternative of the chart. */
  readonly chartSummary: string;
  /** Open incidents in Go's order. */
  readonly needsALook: readonly ActivityIncidentSummary[];
  /** Recent changes in plain words. */
  readonly changes: readonly ActivityChangeModel[];
  /** Nothing was ever recorded: the first-run empty state replaces the content. */
  readonly isEmpty: boolean;
}

/** Props of the Now tab. */
export interface ActivityNowProps {
  /** Opens one incident in the Incidents tab. */
  readonly onOpenIncident: (incidentId: number) => void;
}

/** Props of the resolved Now content. */
export interface ActivityNowContentProps {
  /** The resolved, worded view. */
  readonly model: ActivityNowModel;
  /** Opens one incident in the Incidents tab. */
  readonly onOpenIncident: (incidentId: number) => void;
}

/** Props of the 24-hour chart. */
export interface ActivityHourChartProps {
  /** The drawable bars, oldest first. */
  readonly bars: readonly ActivityHourBarModel[];
  /** Text alternative of the chart. */
  readonly summary: string;
}

/** Props of "Needs a look". */
export interface ActivityNeedsALookProps {
  /** Open incidents in Go's order. */
  readonly incidents: readonly ActivityIncidentSummary[];
  /** Opens one incident in the Incidents tab. */
  readonly onOpenIncident: (incidentId: number) => void;
}

/** Props of "Recent changes". */
export interface ActivityRecentChangesProps {
  /** The newest writes in plain words, newest first. */
  readonly changes: readonly ActivityChangeModel[];
}
