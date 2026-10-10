import type { OrderingCard } from '../../../../infrastructure/season-source/season-source.types';
import type { SeasonSectionId } from '../SeasonWorkspace/season-workspace.types';

/** The four KPI stat-tile values derived from the season's intake rows. */
export interface OverviewKpiSummary {
  /** Every seasonAnimes row, any matchStatus. */
  readonly intakeTotal: number;
  /** Rows where availability === 'created'. */
  readonly createdCount: number;
  /** Created rows with grade >= 1 || skipGrading (the "x" in "x/y"). */
  readonly ratedCount: number;
  /** Created-row count (the "y" in "x/y"). */
  readonly ratedTotal: number;
  /** countApproved(seasonAnimes, minApprovalGrade). */
  readonly approvedCount: number;
  /** season.slots. */
  readonly slots: number;
}

/** One-row horizontal stacked-bar datum for the watching pipeline chart. */
export interface PipelineDatum {
  /** Fixed index value of the single pipeline bar. */
  readonly stage: 'pipeline';
  /** Count per Estrenos section. */
  readonly [section: string]: string | number;
}

/** One-row horizontal stacked-bar datum for the intake health chart. */
export interface IntakeHealthDatum {
  /** Fixed index value of the single intake bar. */
  readonly dim: 'intake';
  /** Count per match status. */
  readonly [status: string]: string | number;
}

/** One vertical-column datum for the grade histogram. */
export interface GradeHistogramDatum {
  /** '1'..'6' — string for a band (categorical) axis. */
  readonly grade: string;
  /** Graded animes in this band. */
  readonly count: number;
  /** True when grade >= minApprovalGrade. */
  readonly emphasis: boolean;
}

/**
 * The three mutually exclusive buckets of the season's created candidates: what
 * confirming the season applies. `approved` + `rejected` + `notYetGraded` always
 * equals `createdTotal`, and an ungraded candidate sits in `notYetGraded` here
 * but is applied as rejected by the backend `ConfirmSelection`.
 */
export interface SelectionOutcomeCounts {
  /** countApproved(rows, minApprovalGrade) — the Selection tab's own decision rule. */
  readonly approved: number;
  /** Created candidates confirming applies as rejected. */
  readonly rejected: number;
  /** Created candidates with no ruling at all (no grade, not skipped, no consideration). */
  readonly notYetGraded: number;
  /** Every created candidate; the three buckets sum to it. */
  readonly createdTotal: number;
}

/** One-row horizontal stacked-bar datum for the selection outcome chart. */
export interface SelectionOutcomeDatum {
  /** Fixed index value of the single outcome bar. */
  readonly dim: 'outcome';
  /** Count per outcome bucket. */
  readonly [bucket: string]: string | number;
}

/** The full view model consumed by OverviewPanel and its chart children. */
export interface OverviewPanelViewModel {
  /** The KPI stat-tile values. */
  readonly kpi: OverviewKpiSummary;
  /** Watching-pipeline bar data; empty when nothing was created. */
  readonly pipeline: readonly PipelineDatum[];
  /** Pipeline stage keys, in conveyor order. */
  readonly pipelineKeys: readonly string[];
  /** Intake-health bar data; empty without intake rows. */
  readonly intakeHealth: readonly IntakeHealthDatum[];
  /** Intake match-status keys, in workflow order. */
  readonly intakeHealthKeys: readonly string[];
  /** One column per grade band 1-6. */
  readonly gradeHistogram: readonly GradeHistogramDatum[];
  /** The season's minimum approval grade. */
  readonly minApprovalGrade: number;
  /** Selection-outcome bar data; empty when nothing was created. */
  readonly selectionOutcome: readonly SelectionOutcomeDatum[];
  /** Outcome bucket keys, in order. */
  readonly selectionOutcomeKeys: readonly string[];
  /** Pipeline/histogram empty-state predicate. */
  readonly hasCreated: boolean;
  /** Intake-health empty-state predicate. */
  readonly hasIntake: boolean;
  /** Histogram empty-state predicate. */
  readonly hasGrades: boolean;
}

/** Props for the four KPI stat tiles. */
export interface OverviewKpiRowProps {
  /** The KPI stat-tile values. */
  readonly kpi: OverviewKpiSummary;
}

/**
 * Props for the watching pipeline stacked-bar chart. It renders for an open
 * season only: the pipeline groups rows by the live Estrenos section, so a
 * closed season's Overview omits the card instead of presenting live data as
 * history.
 */
export interface WatchingPipelineChartProps {
  /** The single stacked-bar datum, empty when nothing was created. */
  readonly data: readonly PipelineDatum[];
  /** The stage keys, in conveyor order. */
  readonly keys: readonly string[];
  /** False renders the empty-state copy instead of a chart. */
  readonly hasCreated: boolean;
}

/** One step of a closed season's outcome funnel. */
export interface OutcomeFunnelStep {
  /** The step's name. */
  readonly label: string;
  /** The step's count. */
  readonly value: string;
  /** Muted text after the count; empty for none. */
  readonly suffix: string;
}

/** Props for a closed season's outcome funnel card. */
export interface OverviewOutcomeFunnelProps {
  /** The funnel steps, in workflow order. */
  readonly steps: readonly OutcomeFunnelStep[];
  /** The muted line under the funnel. */
  readonly meta: string;
}

/**
 * Where a closed season's recorded lineup read stands: in flight, failed,
 * settled without a recorded board, or settled with the stored board.
 */
export type OverviewLineupState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly errorMessage: string }
  | { readonly status: 'unrecorded' }
  | { readonly status: 'recorded'; readonly grid: readonly OrderingCard[]; readonly rail: readonly OrderingCard[] };

/** A settled lineup read, tagged with the season it belongs to. */
export interface LoadedOverviewLineup {
  /** The season the read was for. */
  readonly seasonId: string;
  /** The settled read. */
  readonly state: OverviewLineupState;
}

/** One anime placed on a weekday of the recorded lineup. */
export interface OverviewLineupItem {
  /** A key unique within the lineup. */
  readonly key: string;
  /** The anime's id, for its cover. */
  readonly animeId: string;
  /** The name the board stored. */
  readonly name: string;
  /** The season-owned grade, or null when it has none (below 1). */
  readonly grade: number | null;
}

/** One weekday of the recorded lineup, holding at least one anime. */
export interface OverviewLineupDay {
  /** The weekday (a Spanish data literal). */
  readonly day: string;
  /** The weekday's animes, in stored order. */
  readonly items: readonly OverviewLineupItem[];
}

/** What the final lineup card renders; exactly one display state at a time. */
export interface OverviewLineupView {
  /** The single state the card shows. */
  readonly display: 'loading' | 'failed' | 'unrecorded' | 'empty' | 'lineup';
  /** The failure message, when the read failed. */
  readonly errorMessage: string | undefined;
  /** The weekdays, only when there is a lineup. */
  readonly days: readonly OverviewLineupDay[];
  /** The lineup's one-line summary; empty without a lineup. */
  readonly summary: string;
}

/** Props for the intake health stacked-bar chart. */
export interface IntakeHealthChartProps {
  /** The single stacked-bar datum; empty without intake rows. */
  readonly data: readonly IntakeHealthDatum[];
  /** The stacked-bar segment keys, in order. */
  readonly keys: readonly string[];
  /** False renders the empty-state copy instead of a chart. */
  readonly hasIntake: boolean;
}

/** Props for the grade histogram chart. */
export interface GradeHistogramChartProps {
  /** One column per grade band. */
  readonly data: readonly GradeHistogramDatum[];
  /** The season's minimum approval grade. */
  readonly minApprovalGrade: number;
  /** False renders the empty-state copy instead of a chart. */
  readonly hasGrades: boolean;
}

/** Props for the selection outcome stacked-bar chart. */
export interface SelectionOutcomeChartProps {
  /** The single stacked-bar datum; empty when nothing was created. */
  readonly data: readonly SelectionOutcomeDatum[];
  /** The stacked-bar segment keys, in order. */
  readonly keys: readonly string[];
  /** Created-candidate empty-state predicate; false renders the copy instead of a chart. */
  readonly hasCreated: boolean;
}

/**
 * The nivo-safe datum shape for the grade histogram bars. `emphasis` is
 * intentionally dropped here: nivo's `BarDatum` generic constrains every field
 * to `string | number`, so the emphasis boolean computed in
 * `overview-panel.helpers.ts` cannot travel through the `data` prop directly.
 * The chart's `colors` callback and threshold layer instead re-derive the same
 * boundary from `minApprovalGrade`, which is equivalent to `datum.data.emphasis`
 * for every band nivo renders.
 */
export interface GradeHistogramNivoDatum extends Record<string, string | number> {
  /** The grade band label. */
  readonly grade: string;
  /** Graded animes in this band. */
  readonly count: number;
  /** The season's minimum approval grade. */
  readonly minApprovalGrade: number;
}

/** Structural band-scale surface required by the custom threshold layer. */
export interface GradeBandScale {
  /** Distance between the starts of adjacent bands. */
  readonly step: () => number;
  /** Width of one band. */
  readonly bandwidth: () => number;
  /** Rules out a callable scale, so only the band surface matches. */
  readonly call?: never;
}

/** Props for the Overview panel's cross-section recovery action. */
export interface OverviewPanelProps {
  /** Navigates to another season workflow section. */
  readonly onNavigate: (section: SeasonSectionId) => void;
}

/** Props for the KPI/funnel, chart cards and final lineup shown once the season has intake rows. */
export interface OverviewChartsProps extends OverviewPanelViewModel {
  /** True for a closed season: funnel, outcome charts and the recorded lineup instead of the live tiles. */
  readonly readOnly: boolean;
  /** The closed season's outcome funnel steps. */
  readonly outcomeSteps: readonly OutcomeFunnelStep[];
  /** The muted line under the closed season's funnel. */
  readonly outcomeMeta: string;
}
