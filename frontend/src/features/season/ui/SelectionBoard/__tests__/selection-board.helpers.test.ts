import { describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source';
import { CONSIDERATION_OPTIONS } from '../selection-board.constants';
import {
  countApproved,
  decideVerdict,
  getConsiderationLabel,
  getVerdictLabel,
  quotaStatus,
  runDesktopAction,
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
    availability: 'created', availableEpisodes: 0,
    animeId: 'anime-1',
    section: 'Visto',
    grade: 5,
    gradeSource: 'manual',
    skipGrading: false,
    consideration: 'none',
    folderPath: '',
    pageUrl: '',
    ...overrides,
  };
}

describe('toSelectionRows', () => {
  it('keeps created candidates, derives verdicts, and groups approved first', () => {
    const rows = [
      row({ id: 'a', animeId: 'anime-a', grade: 2 }), // rejected
      row({ id: 'b', animeId: 'anime-b', grade: 5 }), // approved
      row({ id: 'u', availability: 'waiting', availableEpisodes: 0, animeId: '' }), // uncreated → excluded
    ];
    const out = toSelectionRows(rows, 4);
    expect(out.map((r) => r.id)).toEqual(['b', 'a']); // approved first
    expect(out[0].verdict).toBe('approved');
    expect(out[1].verdict).toBe('rejected');
  });

  it('carries folderPath/pageUrl and derives hasPage/hasFolder', () => {
    const rows = [
      row({ id: 'with-both', animeId: 'anime-with-both', folderPath: 'D:/downloads/frieren', pageUrl: 'https://jkanime.net/frieren/' }),
      row({ id: 'without-either', animeId: 'anime-without-either', folderPath: '', pageUrl: '' }),
    ];
    const out = toSelectionRows(rows, 4);
    const withBoth = out.find((r) => r.id === 'with-both');
    const withoutEither = out.find((r) => r.id === 'without-either');

    expect(withBoth?.folderPath).toBe('D:/downloads/frieren');
    expect(withBoth?.pageUrl).toBe('https://jkanime.net/frieren/');
    expect(withBoth?.hasPage).toBe(true);
    expect(withBoth?.hasFolder).toBe(true);

    expect(withoutEither?.folderPath).toBe('');
    expect(withoutEither?.pageUrl).toBe('');
    expect(withoutEither?.hasPage).toBe(false);
    expect(withoutEither?.hasFolder).toBe(false);
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

  it('keeps the consideration select options in none-first order', () => {
    expect(CONSIDERATION_OPTIONS.map((option) => option.value)).toEqual([
      'none',
      'insufficient_quota',
      'temporarily_approved',
      'spare_quota',
    ]);
  });
});

describe('runDesktopAction', () => {
  it('no-ops when the binding is absent (non-Wails context)', async () => {
    await expect(runDesktopAction(undefined, 'a1', 'copied')).resolves.toBeUndefined();
  });

  it('runs the action and skips the toast on a non-copy (open) call', async () => {
    const action = vi.fn().mockResolvedValue({ status: 'ok' });
    await runDesktopAction(action, 'a1');
    expect(action).toHaveBeenCalledWith('a1');
  });

  it('does not throw when the action reports a non-ok status', async () => {
    const action = vi.fn().mockResolvedValue({ status: 'error' });
    await expect(runDesktopAction(action, 'a1', 'copied')).resolves.toBeUndefined();
  });
});
