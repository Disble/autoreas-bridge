import type { SeasonAnimeRow } from '../../../../infrastructure/season-source';
import { getMatchStatusColor } from '../IntakePanel/intake-panel.helpers';
import { countApproved, quotaStatus } from '../SelectionBoard/selection-board.helpers';
import { INTAKE_HEALTH_CHART_COLORS } from './overview-panel.constants';
import type {
  GradeHistogramDatum,
  IntakeHealthDatum,
  OverviewKpiSummary,
  OverviewPanelViewModel,
  PipelineDatum,
  SlotsMeterModel,
} from './overview-panel.types';

/** Fixed conveyor order of the watching pipeline stages (never sorted by count). */
const PIPELINE_KEYS = ['Sin ver', 'Ver hoy', 'Visto'] as const;

/** Fixed workflow order of the intake match statuses. */
const INTAKE_HEALTH_KEYS = ['pending', 'matched', 'ambiguous', 'not_found', 'discarded'] as const;

/** All six grade bands, always present regardless of which grades were used. */
const GRADE_BANDS = ['1', '2', '3', '4', '5', '6'] as const;

/**
 * buildKpiSummary derives the four KPI stat-tile values from the season's intake
 * rows. `approvedCount` always delegates to `countApproved` (never a parallel
 * `grade >= minApprovalGrade` check) so it stays consistent with the Selection
 * tab and the slots meter. Rated x/y is created-rows-only: `y` is the created-row
 * count, `x` is the subset with a resolved grade (graded or explicitly skipped).
 */
export function buildKpiSummary(rows: readonly SeasonAnimeRow[], minApprovalGrade: number, slots: number): OverviewKpiSummary {
  let createdCount = 0;
  let ratedCount = 0;
  for (const r of rows) {
    if (r.availability === 'created' && r.animeId !== '') {
      createdCount += 1;
      if (r.grade >= 1 || r.skipGrading) {
        ratedCount += 1;
      }
    }
  }
  return {
    intakeTotal: rows.length,
    createdCount,
    ratedCount,
    ratedTotal: createdCount,
    approvedCount: countApproved(rows, minApprovalGrade),
    slots,
  };
}

/**
 * buildWatchingPipelineData groups created rows by their backend-populated
 * `section` field into the three ordinal watching-pipeline stages. `section` is
 * a direct filter+group target, never a derived value. Uncreated rows (empty
 * `section`) are excluded. Returns an empty data array when there are no
 * created rows, so the chart can render its empty-state placeholder instead of
 * a zero-height canvas.
 */
export function buildWatchingPipelineData(rows: readonly SeasonAnimeRow[]): {
  data: PipelineDatum[];
  keys: string[];
} {
  const counts: Record<string, number> = { 'Sin ver': 0, 'Ver hoy': 0, Visto: 0 };
  let hasCreated = false;
  for (const r of rows) {
    if (r.availability === 'created' && r.section !== '') {
      hasCreated = true;
      if (r.section in counts) {
        counts[r.section] += 1;
      }
    }
  }
  const keys = [...PIPELINE_KEYS];
  if (!hasCreated) {
    return { data: [], keys };
  }
  return { data: [{ stage: 'pipeline', ...counts }], keys };
}

/**
 * buildIntakeHealthData groups ALL intake rows (created and uncreated) by
 * `matchStatus` across the five workflow statuses. Returns an empty data array
 * when there are no rows at all.
 */
export function buildIntakeHealthData(rows: readonly SeasonAnimeRow[]): {
  data: IntakeHealthDatum[];
  keys: string[];
} {
  const keys = [...INTAKE_HEALTH_KEYS];
  if (rows.length === 0) {
    return { data: [], keys };
  }
  const counts: Record<string, number> = { pending: 0, matched: 0, ambiguous: 0, not_found: 0, discarded: 0 };
  for (const r of rows) {
    if (r.matchStatus in counts) {
      counts[r.matchStatus] += 1;
    }
  }
  return { data: [{ dim: 'intake', ...counts }], keys };
}

/**
 * getIntakeHealthSegmentColor resolves an intake match status to its chart bar
 * color. It always delegates the semantic role to `getMatchStatusColor` first —
 * never a re-derived switch — then maps that role to the chart-tuned literal
 * hex. `discarded` is the one exception: `getMatchStatusColor('discarded')`
 * resolves to the same `default` role as `pending`, but the validated chart
 * palette gives it its own de-emphasis gray, so it is checked before the
 * general role mapping.
 */
export function getIntakeHealthSegmentColor(matchStatus: string): string {
  if (matchStatus === 'discarded') {
    return INTAKE_HEALTH_CHART_COLORS.discarded;
  }
  return INTAKE_HEALTH_CHART_COLORS[getMatchStatusColor(matchStatus)];
}

/**
 * buildGradeHistogramData counts created, graded rows (`grade >= 1`) into their
 * grade band. All six bands (1-6) are always present, even at zero, so the
 * chart's x-axis never shifts. Skip-graded and ungraded rows contribute to no
 * column. `emphasis` is true for grades at or above `minApprovalGrade`
 * (inclusive boundary).
 */
export function buildGradeHistogramData(rows: readonly SeasonAnimeRow[], minApprovalGrade: number): GradeHistogramDatum[] {
  const counts: Record<string, number> = {};
  for (const band of GRADE_BANDS) {
    counts[band] = 0;
  }
  for (const r of rows) {
    if (r.availability === 'created' && r.animeId !== '' && r.grade >= 1) {
      const band = String(r.grade);
      if (band in counts) {
        counts[band] += 1;
      }
    }
  }
  return GRADE_BANDS.map((grade) => ({
    grade,
    count: counts[grade],
    emphasis: Number(grade) >= minApprovalGrade,
  }));
}

/**
 * buildSlotsMeterModel derives the approved-vs-slots meter state. `approved`
 * and `status` delegate to `countApproved`/`quotaStatus` (the same derivation as
 * the Approved KPI tile) — `meterValue` clamps to `slots` so the HeroUI Meter
 * fill never exceeds its track, while `label` always shows the true ratio.
 */
export function buildSlotsMeterModel(rows: readonly SeasonAnimeRow[], minApprovalGrade: number, slots: number): SlotsMeterModel {
  const approved = countApproved(rows, minApprovalGrade);
  const status = quotaStatus(approved, slots);
  const isOverQuota = approved > slots;
  const color = status === 'over' ? 'danger' : status === 'at' ? 'success' : 'accent';
  const label = isOverQuota ? `${approved} / ${slots} · Over quota` : `${approved} / ${slots}`;
  return {
    approved,
    slots,
    meterValue: Math.min(approved, slots),
    isOverQuota,
    status,
    color,
    label,
  };
}

/**
 * buildOverviewViewModel orchestrates every aggregator above into the single
 * view model OverviewPanel and its chart children consume. This is the sole
 * `useMemo` target of `use-overview-panel.ts`.
 */
export function buildOverviewViewModel(rows: readonly SeasonAnimeRow[], minApprovalGrade: number, slots: number): OverviewPanelViewModel {
  const kpi = buildKpiSummary(rows, minApprovalGrade, slots);
  const pipeline = buildWatchingPipelineData(rows);
  const intakeHealth = buildIntakeHealthData(rows);
  const gradeHistogram = buildGradeHistogramData(rows, minApprovalGrade);
  const slotsMeter = buildSlotsMeterModel(rows, minApprovalGrade, slots);
  return {
    kpi,
    pipeline: pipeline.data,
    pipelineKeys: pipeline.keys,
    intakeHealth: intakeHealth.data,
    intakeHealthKeys: intakeHealth.keys,
    gradeHistogram,
    minApprovalGrade,
    slotsMeter,
    hasCreated: kpi.createdCount > 0,
    hasIntake: kpi.intakeTotal > 0,
    hasGrades: gradeHistogram.some((d) => d.count > 0),
  };
}
