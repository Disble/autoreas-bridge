import { describe, expect, it } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source';
import { getMatchStatusColor } from '../../IntakePanel/intake-panel.helpers';
import { INTAKE_HEALTH_CHART_COLORS } from '../overview-panel.constants';
import {
  buildGradeHistogramData,
  buildIntakeHealthData,
  buildIntegerTicks,
  buildKpiSummary,
  buildOverviewViewModel,
  buildSlotsMeterModel,
  buildWatchingPipelineData,
  getIntakeHealthSegmentColor,
  sumStackTotal,
} from '../overview-panel.helpers';

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

describe('buildSlotsMeterModel', () => {
  it('classifies an under-quota approved count', () => {
    const model = buildSlotsMeterModel([createdRow({ grade: 5 })], 4, 12);
    expect(model.status).toBe('under');
    expect(model.color).toBe('accent');
    expect(model.meterValue).toBe(1);
    expect(model.isOverQuota).toBe(false);
  });

  it('classifies an at-quota approved count', () => {
    const rows = Array.from({ length: 2 }, (_, i) => createdRow({ id: `a${i}`, grade: 5 }));
    const model = buildSlotsMeterModel(rows, 4, 2);
    expect(model.status).toBe('at');
    expect(model.color).toBe('success');
    expect(model.meterValue).toBe(2);
  });

  it('caps the meter value and flags an over-quota approved count without hiding the true ratio', () => {
    const rows = Array.from({ length: 14 }, (_, i) => createdRow({ id: `a${i}`, grade: 5 }));
    const model = buildSlotsMeterModel(rows, 4, 12);
    expect(model.approved).toBe(14);
    expect(model.slots).toBe(12);
    expect(model.meterValue).toBe(12);
    expect(model.isOverQuota).toBe(true);
    expect(model.status).toBe('over');
    expect(model.color).toBe('danger');
    expect(model.label).toContain('14 / 12');
  });
});

describe('buildOverviewViewModel', () => {
  it('marks every empty-state predicate false for a fresh season', () => {
    const vm = buildOverviewViewModel([], 4, 12);
    expect(vm.hasCreated).toBe(false);
    expect(vm.hasIntake).toBe(false);
    expect(vm.hasGrades).toBe(false);
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
  });
});
