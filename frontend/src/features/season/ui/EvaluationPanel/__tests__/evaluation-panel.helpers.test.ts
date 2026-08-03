import { describe, expect, it } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source/season-source.types';
import type { EvaluationRow } from '../evaluation-panel.types';
import { countUngraded, formatRatedAt, getGradeSourceLabel, toEvaluationRows } from '../evaluation-panel.helpers';

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
