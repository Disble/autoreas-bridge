import { describe, expect, it } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source/season-source.types';
import { getMatchStatusColor } from '../../IntakePanel/intake-panel.helpers';
import { INTAKE_HEALTH_CHART_COLORS } from '../overview-panel.constants';
import {
  buildGradeHistogramData,
  buildIntakeHealthData,
  buildIntegerTicks,
  buildKpiSummary,
  buildOutcomeFunnelSteps,
  buildOverviewViewModel,
  buildSelectionOutcomeCounts,
  buildSelectionOutcomeData,
  buildWatchingPipelineData,
  formatOutcomeMeta,
  getIntakeHealthSegmentColor,
  sumStackTotal,
} from '../overview-panel.helpers';

/** Builds a season intake row for a case, defaulting to an uncreated pending row. */
function row(overrides: Partial<SeasonAnimeRow> = {}): SeasonAnimeRow {
  return {
    id: 'sa-1',
    rawName: 'Anime',
    matchStatus: 'pending',
    matchedSlug: '',
    candidates: [],
    availability: 'pending',
    availableEpisodes: 0,
    animeId: '',
    section: '', sectionOrder: 0,
    grade: 0,
    gradeSource: '',
    skipGrading: false,
    consideration: 'none',
    ...overrides,
  };
}

/** Builds a created season anime row (availability created and a non-empty animeId) on top of `row`. */
function createdRow(overrides: Partial<SeasonAnimeRow> = {}): SeasonAnimeRow {
  return row({
    matchStatus: 'matched',
    availability: 'created',
    animeId: 'anime-x',
    section: 'Visto', sectionOrder: 0,
    ...overrides,
  });
}

describe('buildKpiSummary', () => {
  it('returns all zeros for an empty season', () => {
    const kpi = buildKpiSummary([], 4, 12);
    expect(kpi).toEqual({ intakeTotal: 0, createdCount: 0, ratedCount: 0, ratedTotal: 0, approvedCount: 0, slots: 12 });
  });

  it('matches the spec mixed-status scenario', () => {
    const created = [
      createdRow({ id: 'c1', grade: 5 }),
      createdRow({ id: 'c2', grade: 4 }),
      createdRow({ id: 'c3', grade: 6 }),
      createdRow({ id: 'c4', grade: 2 }),
      createdRow({ id: 'c5', grade: 0, skipGrading: true }),
      createdRow({ id: 'c6', grade: 0, skipGrading: true }),
    ];
    const uncreated = [
      row({ id: 'u1', matchStatus: 'pending' }),
      row({ id: 'u2', matchStatus: 'ambiguous' }),
      row({ id: 'u3', matchStatus: 'not_found' }),
      row({ id: 'u4', matchStatus: 'discarded' }),
    ];
    const kpi = buildKpiSummary([...created, ...uncreated], 4, 12);
    expect(kpi.intakeTotal).toBe(10);
    expect(kpi.createdCount).toBe(6);
    expect(kpi.ratedTotal).toBe(6);
    expect(kpi.ratedCount).toBe(6);
    expect(kpi.approvedCount).toBe(3);
    expect(kpi.slots).toBe(12);
  });

  it('counts a rescue-consideration row as approved via countApproved, never grade >= minApprovalGrade directly', () => {
    const kpi = buildKpiSummary([createdRow({ grade: 3, consideration: 'temporarily_approved' })], 4, 12);
    expect(kpi.approvedCount).toBe(1);
  });
});

describe('buildWatchingPipelineData', () => {
  it('returns no data when there are no created rows', () => {
    const { data } = buildWatchingPipelineData([row({ matchStatus: 'pending' })]);
    expect(data).toEqual([]);
  });

  it('groups created rows by section in fixed conveyor order regardless of the largest count', () => {
    const rows = [
      createdRow({ id: 'a', section: 'Sin ver' }),
      createdRow({ id: 'b', section: 'Ver hoy' }),
      createdRow({ id: 'c', section: 'Ver hoy' }),
      createdRow({ id: 'd', section: 'Ver hoy' }),
      createdRow({ id: 'e', section: 'Ver hoy' }),
      createdRow({ id: 'f', section: 'Ver hoy' }),
      createdRow({ id: 'g', section: 'Visto' }),
      createdRow({ id: 'h', section: 'Visto' }),
    ];
    const { data, keys } = buildWatchingPipelineData(rows);
    expect(keys).toEqual(['Sin ver', 'Ver hoy', 'Visto']);
    expect(data).toEqual([{ stage: 'pipeline', 'Sin ver': 1, 'Ver hoy': 5, Visto: 2 }]);
  });

  it('excludes uncreated rows from the total', () => {
    const rows = [
      createdRow({ id: 'a', section: 'Sin ver' }),
      createdRow({ id: 'b', section: 'Ver hoy' }),
      createdRow({ id: 'c', section: 'Visto' }),
      row({ id: 'd', matchStatus: 'matched' }),
      row({ id: 'e', matchStatus: 'pending' }),
      row({ id: 'f', matchStatus: 'ambiguous' }),
      row({ id: 'g', matchStatus: 'not_found' }),
    ];
    const { data } = buildWatchingPipelineData(rows);
    const total = Object.values(data[0]).reduce<number>((sum, v) => (typeof v === 'number' ? sum + v : sum), 0);
    expect(total).toBe(3);
  });
});

describe('buildIntakeHealthData', () => {
  it('returns no data for an empty season', () => {
    expect(buildIntakeHealthData([]).data).toEqual([]);
  });

  it('counts every row across all five statuses regardless of creation state', () => {
    const rows = [
      row({ id: 'p1', matchStatus: 'pending' }),
      row({ id: 'p2', matchStatus: 'pending' }),
      row({ id: 'm1', matchStatus: 'matched' }),
      row({ id: 'm2', matchStatus: 'matched' }),
      createdRow({ id: 'm3', matchStatus: 'matched' }),
      row({ id: 'a1', matchStatus: 'ambiguous' }),
      row({ id: 'n1', matchStatus: 'not_found' }),
      row({ id: 'd1', matchStatus: 'discarded' }),
    ];
    const { data, keys } = buildIntakeHealthData(rows);
    expect(keys).toEqual(['pending', 'matched', 'ambiguous', 'not_found', 'discarded']);
    const total = Object.values(data[0]).reduce<number>((sum, v) => (typeof v === 'number' ? sum + v : sum), 0);
    expect(total).toBe(8);
    expect(data[0].matched).toBe(3);
  });
});

describe('sumStackTotal', () => {
  it('sums only the segment keys of a stacked datum, ignoring the index field', () => {
    const datum = { dim: 'intake', pending: 0, matched: 17, ambiguous: 3, not_found: 1, discarded: 0 };
    expect(sumStackTotal(datum, ['pending', 'matched', 'ambiguous', 'not_found', 'discarded'])).toBe(21);
  });

  it('returns 0 for an all-zero stack', () => {
    expect(sumStackTotal({ stage: 'pipeline', 'Sin ver': 0, 'Ver hoy': 0, Visto: 0 }, ['Sin ver', 'Ver hoy', 'Visto'])).toBe(0);
  });
});

describe('buildIntegerTicks', () => {
  it('returns whole-number ticks for a single-count domain (never fractional ticks)', () => {
    expect(buildIntegerTicks(1)).toEqual([0, 1]);
  });

  it('enumerates every integer for small totals', () => {
    expect(buildIntegerTicks(8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('steps by a nice integer for larger totals, never exceeding the total', () => {
    expect(buildIntegerTicks(21)).toEqual([0, 5, 10, 15, 20]);
    const ticks = buildIntegerTicks(21);
    expect(Math.max(...ticks)).toBeLessThanOrEqual(21);
    expect(ticks.every((t) => Number.isInteger(t))).toBe(true);
  });

  it('handles zero defensively', () => {
    expect(buildIntegerTicks(0)).toEqual([0]);
  });
});

describe('getIntakeHealthSegmentColor', () => {
  it('resolves matched to the same semantic role as getMatchStatusColor', () => {
    const role = getMatchStatusColor('matched');
    expect(role).toBe('success');
    expect(getIntakeHealthSegmentColor('matched')).toBe(INTAKE_HEALTH_CHART_COLORS[role]);
  });
});

describe('buildGradeHistogramData', () => {
  it('always includes all six grade bands', () => {
    const data = buildGradeHistogramData([], 4);
    expect(data.map((d) => d.grade)).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('excludes skip-graded and ungraded rows from every column', () => {
    const rows = [
      createdRow({ id: 'a', grade: 6 }),
      createdRow({ id: 'b', grade: 5 }),
      createdRow({ id: 'c', grade: 5 }),
      createdRow({ id: 'd', grade: 0, skipGrading: true }),
      createdRow({ id: 'e', grade: 0, skipGrading: true }),
    ];
    const data = buildGradeHistogramData(rows, 4);
    const byGrade = Object.fromEntries(data.map((d) => [d.grade, d.count]));
    expect(byGrade['6']).toBe(1);
    expect(byGrade['5']).toBe(2);
    expect(byGrade['1']).toBe(0);
    expect(byGrade['2']).toBe(0);
    expect(byGrade['3']).toBe(0);
    expect(byGrade['4']).toBe(0);
  });

  it('emphasizes grades >= minApprovalGrade inclusive of the boundary', () => {
    const data = buildGradeHistogramData([], 4);
    const emphasisByGrade = Object.fromEntries(data.map((d) => [d.grade, d.emphasis]));
    expect(emphasisByGrade['4']).toBe(true);
    expect(emphasisByGrade['5']).toBe(true);
    expect(emphasisByGrade['6']).toBe(true);
    expect(emphasisByGrade['3']).toBe(false);
    expect(emphasisByGrade['2']).toBe(false);
    expect(emphasisByGrade['1']).toBe(false);
  });
});

/** One selection-outcome bucket case: rows in, the three mutually exclusive buckets out. */
interface SelectionOutcomeCase {
  readonly name: string;
  readonly rows: readonly SeasonAnimeRow[];
  readonly approved: number;
  readonly rejected: number;
  readonly notYetGraded: number;
  readonly createdTotal: number;
}

describe('buildSelectionOutcomeCounts', () => {
  const cases: readonly SelectionOutcomeCase[] = [
    { name: 'breaks an empty season into three zero buckets', rows: [], approved: 0, rejected: 0, notYetGraded: 0, createdTotal: 0 },
    {
      name: 'counts a grade-0 row rescued by a consideration as approved, never not-yet-graded',
      rows: [createdRow({ grade: 0, consideration: 'temporarily_approved' })],
      approved: 1, rejected: 0, notYetGraded: 0, createdTotal: 1,
    },
    {
      name: 'counts a skip-graded grade-0 row as rejected',
      rows: [createdRow({ grade: 0, skipGrading: true })],
      approved: 0, rejected: 1, notYetGraded: 0, createdTotal: 1,
    },
    {
      name: 'counts a grade-0 row with the insufficient-quota consideration as rejected',
      rows: [createdRow({ grade: 0, consideration: 'insufficient_quota' })],
      approved: 0, rejected: 1, notYetGraded: 0, createdTotal: 1,
    },
    {
      name: 'counts a row exactly at minApprovalGrade as approved',
      rows: [createdRow({ grade: 4 })],
      approved: 1, rejected: 0, notYetGraded: 0, createdTotal: 1,
    },
    {
      name: 'counts a legacy positive-progress row with no grade into the no-grade bucket',
      rows: [createdRow({ grade: 0 })],
      approved: 0, rejected: 0, notYetGraded: 1, createdTotal: 1,
    },
    {
      name: 'counts a grade-1 row as rejected rather than as having no grade',
      rows: [createdRow({ grade: 1 })],
      approved: 0, rejected: 1, notYetGraded: 0, createdTotal: 1,
    },
    {
      name: 'ignores an uncreated row that already carries an anime id',
      rows: [row({ availability: 'matched', animeId: 'anime-linked' })],
      approved: 0, rejected: 0, notYetGraded: 0, createdTotal: 0,
    },
    {
      name: 'ignores a created row with no linked anime',
      rows: [row({ availability: 'created', animeId: '' })],
      approved: 0, rejected: 0, notYetGraded: 0, createdTotal: 0,
    },
    {
      name: 'keeps the buckets mutually exclusive and summing to createdTotal over a mixed season',
      rows: [
        createdRow({ id: 'a', grade: 5 }),
        createdRow({ id: 'b', grade: 0, consideration: 'spare_quota' }),
        createdRow({ id: 'c', grade: 0, skipGrading: true }),
        createdRow({ id: 'd', grade: 0, consideration: 'insufficient_quota' }),
        createdRow({ id: 'e', grade: 2 }),
        createdRow({ id: 'f', grade: 0 }),
        row({ id: 'g', matchStatus: 'pending' }),
      ],
      approved: 2, rejected: 3, notYetGraded: 1, createdTotal: 6,
    },
  ];

  it.each(cases)('$name', ({ rows, approved, rejected, notYetGraded, createdTotal }) => {
    const counts = buildSelectionOutcomeCounts(rows, 4);
    expect(counts).toEqual({ approved, rejected, notYetGraded, createdTotal });
    expect(counts.approved + counts.rejected + counts.notYetGraded).toBe(counts.createdTotal);
  });
});

describe('buildSelectionOutcomeData', () => {
  it('returns no data when no candidate has been created', () => {
    expect(buildSelectionOutcomeData([row({ matchStatus: 'pending' })], 4).data).toEqual([]);
  });

  it('returns the single three-bucket stacked datum in fixed bucket order', () => {
    const rows = [createdRow({ id: 'a', grade: 5 }), createdRow({ id: 'b', grade: 0 })];
    const { data, keys } = buildSelectionOutcomeData(rows, 4);
    expect(keys).toEqual(['Approved', 'Rejected', 'No grade']);
    expect(data).toEqual([{ dim: 'outcome', Approved: 1, Rejected: 0, 'No grade': 1 }]);
  });
});

describe('buildOverviewViewModel', () => {
  it('marks every empty-state predicate false for a fresh season', () => {
    const vm = buildOverviewViewModel([], 4, 12);
    expect(vm.hasCreated).toBe(false);
    expect(vm.hasIntake).toBe(false);
    expect(vm.hasGrades).toBe(false);
    expect(vm.selectionOutcome).toEqual([]);
  });

  it('marks hasGrades true and leaves no ungraded remainder when every created row is graded or skipped', () => {
    const rows = [
      createdRow({ id: 'a', grade: 5 }),
      createdRow({ id: 'b', grade: 0, skipGrading: true }),
    ];
    const vm = buildOverviewViewModel(rows, 4, 12);
    expect(vm.hasGrades).toBe(true);
    const total = vm.gradeHistogram.reduce((sum, d) => sum + d.count, 0);
    expect(total).toBe(1); // only the graded row contributes a column; the skip-graded row does not
    expect(vm.kpi.ratedCount).toBe(2);
    expect(vm.kpi.ratedTotal).toBe(2);
    expect(vm.selectionOutcomeKeys).toEqual(['Approved', 'Rejected', 'No grade']);
    expect(vm.selectionOutcome).toEqual([{ dim: 'outcome', Approved: 1, Rejected: 1, 'No grade': 0 }]);
  });
});

describe('buildOutcomeFunnelSteps', () => {
  it('walks intake, created, rated and approved against the slots, in that order', () => {
    const kpi = { intakeTotal: 22, createdCount: 19, ratedCount: 18, ratedTotal: 19, approvedCount: 9, slots: 12 };

    expect(buildOutcomeFunnelSteps(kpi)).toEqual([
      { label: 'Intake', value: '22', suffix: '' },
      { label: 'Created', value: '19', suffix: '' },
      { label: 'Rated', value: '18', suffix: '' },
      { label: 'Approved', value: '9', suffix: '/ 12 slots' },
    ]);
  });
});

describe('formatOutcomeMeta', () => {
  /** A KPI summary with the given intake and created totals. */
  function kpiWith(intakeTotal: number, createdCount: number) {
    return { intakeTotal, createdCount, ratedCount: 0, ratedTotal: createdCount, approvedCount: 0, slots: 12 };
  }

  it.each([
    { name: 'every intake name created', createdLabel: 'July 8, 2026', kpi: kpiWith(3, 3), want: 'Created July 8, 2026 · Minimum approval grade 4' },
    {
      name: 'one intake name never created',
      createdLabel: 'July 8, 2026',
      kpi: kpiWith(3, 2),
      want: 'Created July 8, 2026 · Minimum approval grade 4 · 1 intake name never created',
    },
    { name: 'two intake names never created', createdLabel: '', kpi: kpiWith(3, 1), want: 'Minimum approval grade 4 · 2 intake names never created' },
  ])('describes a season with $name', ({ createdLabel, kpi, want }) => {
    expect(formatOutcomeMeta(createdLabel, 4, kpi)).toBe(want);
  });
});
