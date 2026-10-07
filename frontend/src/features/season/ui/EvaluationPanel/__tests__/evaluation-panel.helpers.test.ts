import { describe, expect, it } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source/season-source.types';
import type { EvaluationRow } from '../evaluation-panel.types';
import {
  countUngraded,
  formatRatedAt,
  getGradeChip,
  getGradeSourceLabel,
  toEvaluationListItems,
  toEvaluationRows,
} from '../evaluation-panel.helpers';

/** Builds a created season row with the given overrides. */
function row(overrides: Partial<SeasonAnimeRow> = {}): SeasonAnimeRow {
  return {
    id: 'sa-1',
    rawName: 'Anime',
    matchStatus: 'matched',
    matchedSlug: 'x',
    candidates: [],
    availability: 'created', availableEpisodes: 0,
    animeId: 'anime-1',
    section: 'Visto', sectionOrder: 0,
    grade: 0,
    gradeSource: '',
    skipGrading: false,
    consideration: 'none',    ...overrides,
  };
}

/** Builds an Evaluation row with the given overrides. */
function evalRow(overrides: Partial<EvaluationRow> = {}): EvaluationRow {
  return { id: 'e', animeId: 'a', rawName: 'A', grade: 0, gradeSource: '', skipGrading: false, ...overrides };
}

describe('toEvaluationRows', () => {
  it('keeps only created candidates and maps the grade fields', () => {
    const rows = [
      row({ id: 'a', animeId: 'anime-a', grade: 4, gradeSource: 'manual' }),
      row({ id: 'b', availability: 'waiting', availableEpisodes: 0, animeId: '' }), // uncreated
    ];
    const out = toEvaluationRows(rows);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'a', animeId: 'anime-a', grade: 4, gradeSource: 'manual' });
  });

  it('ignores created rows without a linked anime id', () => {
    expect(toEvaluationRows([row({ availability: 'created', availableEpisodes: 0, animeId: '' })])).toHaveLength(0);
  });
});

describe('countUngraded', () => {
  it('counts ungraded, non-skipped candidates only', () => {
    const rows = [
      evalRow({ grade: 0, skipGrading: false }),
      evalRow({ grade: 0, skipGrading: true }), // skipped, excluded
      evalRow({ grade: 5, skipGrading: false }), // graded, excluded
      evalRow({ grade: 1, skipGrading: false }), // lowest grade still counts as graded
    ];
    expect(countUngraded(rows)).toBe(1);
  });
});

describe('formatRatedAt', () => {
  it('renders a dash when never rated', () => {
    expect(formatRatedAt(undefined)).toBe('—');
    expect(formatRatedAt(0)).toBe('—');
  });

  it('renders a non-empty date when rated', () => {
    expect(formatRatedAt(1_751_500_000_000)).not.toBe('—');
  });
});

describe('getGradeSourceLabel', () => {
  it('labels the capture source', () => {
    expect(getGradeSourceLabel('mobile_sync')).toBe('Mobile');
    expect(getGradeSourceLabel('manual')).toBe('Manual');
    expect(getGradeSourceLabel('')).toBe('');
  });
});

describe('getGradeChip', () => {
  it.each([
    { grade: 5, skipGrading: false, expected: { label: 'Grade 5', color: 'success' } },
    { grade: 1, skipGrading: true, expected: { label: 'Grade 1', color: 'success' } },
    { grade: 0, skipGrading: true, expected: { label: 'Skipped', color: 'default' } },
    { grade: 0, skipGrading: false, expected: { label: 'No grade', color: 'warning' } },
  ])('maps grade $grade (skipped: $skipGrading) to its chip', ({ grade, skipGrading, expected }) => {
    expect(getGradeChip({ grade, skipGrading })).toEqual(expected);
  });
});

describe('toEvaluationListItems', () => {
  it('lists ungraded rows first, keeping the relative order of each group', () => {
    const rows = [
      evalRow({ id: 'graded', grade: 4 }),
      evalRow({ id: 'pending-1' }),
      evalRow({ id: 'skipped', skipGrading: true }),
      evalRow({ id: 'pending-2' }),
      evalRow({ id: 'graded-skipped', grade: 2, skipGrading: true }),
    ];

    const items = toEvaluationListItems(rows);

    expect(items.map((item) => [item.row.id, item.isPending])).toEqual([
      ['pending-1', true],
      ['pending-2', true],
      ['graded', false],
      ['skipped', false],
      ['graded-skipped', false],
    ]);
  });

  it.each([
    { name: 'an ungraded row', row: evalRow({ gradeSource: 'manual', ratedAt: 1 }), meta: 'Not rated yet' },
    { name: 'a mobile grade', row: evalRow({ grade: 5, gradeSource: 'mobile_sync', ratedAt: 1_751_500_000_000 }), meta: `Mobile · ${formatRatedAt(1_751_500_000_000)}` },
    { name: 'a manual grade', row: evalRow({ grade: 3, gradeSource: 'manual', ratedAt: 1_751_500_000_000 }), meta: `Manual · ${formatRatedAt(1_751_500_000_000)}` },
    { name: 'a sourceless skip', row: evalRow({ skipGrading: true }), meta: '—' },
  ])('describes $name with its meta line and grade chip', ({ row, meta }) => {
    const [item] = toEvaluationListItems([row]);

    expect(item.meta).toBe(meta);
    expect(item.chip).toEqual(getGradeChip(row));
  });
});
