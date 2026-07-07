import { describe, expect, it } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source';
import {
  countApproved,
  decideVerdict,
  getConsiderationLabel,
  getVerdictLabel,
  quotaStatus,
  toSelectionRows,
} from '../selection-board.helpers';

// TWIN of the Go golden suite (internal/season/domain/decision_test.go). The SAME
// rows must yield the SAME verdicts in both languages — drift-proof by design.
describe('decideVerdict (Excel-parity twin)', () => {
  const cases: ReadonlyArray<readonly [string, number, number, string, 'approved' | 'rejected']> = [
    ['MAO grade 3 rejects', 3, 4, 'none', 'rejected'],
    ['Honzuki grade 4 approves', 4, 4, 'none', 'approved'],
    ['Akane-banashi grade 5 approves', 5, 4, 'none', 'approved'],
    ['Koori no Jouheki grade 2 rejects', 2, 4, 'none', 'rejected'],
    ['Jishou Akuyaku grade 4 + Insufficient quota rejects', 4, 4, 'insufficient_quota', 'rejected'],
    ['failing grade rescued by Spare quota', 3, 4, 'spare_quota', 'approved'],
    ['failing grade rescued by Temporarily approved', 2, 4, 'temporarily_approved', 'approved'],
    ['passing grade with Spare quota still approves', 5, 4, 'spare_quota', 'approved'],
    ['ungraded rejects', 0, 4, 'none', 'rejected'],
    ['ungraded rescued by Spare quota', 0, 4, 'spare_quota', 'approved'],
    ['grade equal to cutoff approves', 4, 4, 'none', 'approved'],
    ['cutoff 5: grade 4 rejects', 4, 5, 'none', 'rejected'],
    ['cutoff 5: grade 5 approves', 5, 5, 'none', 'approved'],
    ['cutoff 3: grade 3 approves', 3, 3, 'none', 'approved'],
  ];

  for (const [name, grade, minApprovalGrade, consideration, want] of cases) {
    it(name, () => {
      expect(decideVerdict(grade, minApprovalGrade, consideration)).toBe(want);
    });
  }
});

function row(overrides: Partial<SeasonAnimeRow> = {}): SeasonAnimeRow {
  return {
    id: 'sa',
    rawName: 'Anime',
    matchStatus: 'matched',
    matchedSlug: 'x',
    candidates: [],
    availability: 'created', availableChapters: 0,
    animeId: 'anime-1',
    section: 'Visto',
    grade: 5,
    gradeSource: 'manual',
    skipGrading: false,
    consideration: 'none',
    ...overrides,
  };
}

describe('toSelectionRows', () => {
  it('keeps created candidates, derives verdicts, and groups approved first', () => {
    const rows = [
      row({ id: 'a', animeId: 'anime-a', grade: 2 }), // rejected
      row({ id: 'b', animeId: 'anime-b', grade: 5 }), // approved
      row({ id: 'u', availability: 'waiting', availableChapters: 0, animeId: '' }), // uncreated → excluded
    ];
    const out = toSelectionRows(rows, 4);
    expect(out.map((r) => r.id)).toEqual(['b', 'a']); // approved first
    expect(out[0].verdict).toBe('approved');
    expect(out[1].verdict).toBe('rejected');
  });
});

describe('countApproved', () => {
  it('counts approved created candidates', () => {
    const rows = [row({ animeId: 'a', grade: 5 }), row({ id: 'b', animeId: 'b', grade: 2 })];
    expect(countApproved(rows, 4)).toBe(1);
  });
});

describe('quotaStatus', () => {
  it('classifies under / at / over the slot cap', () => {
    expect(quotaStatus(9, 12)).toBe('under');
    expect(quotaStatus(12, 12)).toBe('at');
    expect(quotaStatus(13, 12)).toBe('over');
  });
});

describe('labels', () => {
  it('renders English verdict labels', () => {
    expect(getVerdictLabel('approved')).toBe('Approved');
    expect(getVerdictLabel('rejected')).toBe('Rejected');
  });

  it('renders English consideration labels', () => {
    expect(getConsiderationLabel('none')).toBe('None');
    expect(getConsiderationLabel('insufficient_quota')).toBe('Insufficient quota');
    expect(getConsiderationLabel('temporarily_approved')).toBe('Temporarily approved');
    expect(getConsiderationLabel('spare_quota')).toBe('Spare quota');
  });
});
