import type { QuotaStatus } from '../SelectionBoard/selection-board.types';

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
  readonly stage: 'pipeline';
  readonly [section: string]: string | number;
}

/** One-row horizontal stacked-bar datum for the intake health chart. */
export interface IntakeHealthDatum {
  readonly dim: 'intake';
  readonly [status: string]: string | number;
}

/** One vertical-column datum for the grade histogram. */
export interface GradeHistogramDatum {
  /** '1'..'6' — string for a band (categorical) axis. */
  readonly grade: string;
  readonly count: number;
  /** True when grade >= minApprovalGrade. */
  readonly emphasis: boolean;
}

/** The derived model backing the HeroUI Meter for approved-vs-slots. */
export interface SlotsMeterModel {
  /** The true approved count (may exceed slots). */
  readonly approved: number;
  /** Meter maxValue. */
  readonly slots: number;
  /** min(approved, slots) — the clamped bar value, never exceeds the track. */
  readonly meterValue: number;
  /** True when approved > slots. */
  readonly isOverQuota: boolean;
  readonly status: QuotaStatus;
  /** HeroUI Meter color prop. */
  readonly color: 'accent' | 'success' | 'danger';
  /** e.g. "3 / 12" or "14 / 12 · Over quota". */
  readonly label: string;
}

/** The full view model consumed by OverviewPanel and its chart children. */
export interface OverviewPanelViewModel {
  readonly kpi: OverviewKpiSummary;
  readonly pipeline: readonly PipelineDatum[];
  readonly pipelineKeys: readonly string[];
  readonly intakeHealth: readonly IntakeHealthDatum[];
  readonly intakeHealthKeys: readonly string[];
  readonly gradeHistogram: readonly GradeHistogramDatum[];
  readonly minApprovalGrade: number;
  readonly slotsMeter: SlotsMeterModel;
  /** Pipeline/histogram empty-state predicate. */
  readonly hasCreated: boolean;
  /** Intake-health empty-state predicate. */
  readonly hasIntake: boolean;
  /** Histogram empty-state predicate. */
  readonly hasGrades: boolean;
}

/** Props for the four KPI stat tiles. */
export interface OverviewKpiRowProps {
  readonly kpi: OverviewKpiSummary;
}

/** Props for the watching pipeline stacked-bar chart. */
export interface WatchingPipelineChartProps {
  readonly data: readonly PipelineDatum[];
  readonly keys: readonly string[];
  readonly hasCreated: boolean;
}

/** Props for the intake health stacked-bar chart. */
export interface IntakeHealthChartProps {
  readonly data: readonly IntakeHealthDatum[];
  readonly keys: readonly string[];
  readonly hasIntake: boolean;
}

/** Props for the grade histogram chart. */
export interface GradeHistogramChartProps {
  readonly data: readonly GradeHistogramDatum[];
  readonly minApprovalGrade: number;
  readonly hasGrades: boolean;
}

/** Props for the approved-vs-slots meter. */
export interface SlotsMeterProps {
  readonly model: SlotsMeterModel;
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
  readonly grade: string;
  readonly count: number;
  readonly minApprovalGrade: number;
}

/** Structural band-scale surface required by the custom threshold layer. */
export interface GradeBandScale {
  readonly step: () => number;
  readonly bandwidth: () => number;
  readonly call?: never;
}
