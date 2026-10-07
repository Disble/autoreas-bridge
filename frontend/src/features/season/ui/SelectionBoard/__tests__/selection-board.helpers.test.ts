import { describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source/season-source.types';
import { CONSIDERATION_OPTIONS } from '../selection-board.constants';
import {
  countApproved,
  decideVerdict,
  formatConfirmSuccess,
  formatSelectionConfirmedLabel,
  formatSelectionGrade,
  getConsiderationLabel,
  getQuotaColor,
  getVerdictLabel,
  groupSelectionRows,
  quotaStatus,
  runDesktopAction,
  toConsiderationToken,
  toSelectionRows,
} from '../selection-board.helpers';

describe('formatConfirmSuccess', () => {
  it('builds the applied-reconciliation copy from the counts', () => {
    expect(formatConfirmSuccess(9, 10)).toBe('Reconciliation applied — 9 approved, 10 rejected.');
  });
});

describe('formatSelectionConfirmedLabel', () => {
  it('reports "Not confirmed yet" when the milestone was never stamped', () => {
    expect(formatSelectionConfirmedLabel(undefined)).toBe('Not confirmed yet');
    expect(formatSelectionConfirmedLabel(0)).toBe('Not confirmed yet');
  });

  it('reports a localized "Confirmed <time>" label when the milestone exists', () => {
    const ms = 1_753_000_000_000;
    expect(formatSelectionConfirmedLabel(ms)).toBe(`Confirmed ${new Date(ms).toLocaleString()}`);
  });
});

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

/** Builds a created, graded season anime row, overriding only what a case sets. */
function row(overrides: Partial<SeasonAnimeRow> = {}): SeasonAnimeRow {
  return {
    id: 'sa',
    rawName: 'Anime',
    matchStatus: 'matched',
    matchedSlug: 'x',
    candidates: [],
    availability: 'created', availableEpisodes: 0,
    animeId: 'anime-1',
    section: 'Visto', sectionOrder: 0,
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

describe('getQuotaColor', () => {
  it.each([
    ['under', 'success'],
    ['at', 'warning'],
    ['over', 'danger'],
  ] as const)('colors a quota %s the cap as %s', (quota, color) => {
    expect(getQuotaColor(quota)).toBe(color);
  });
});

describe('formatSelectionGrade', () => {
  it.each([
    [6, '6'],
    [1, '1'],
    [0, '—'],
  ])('shows grade %i as %s', (grade, label) => {
    expect(formatSelectionGrade(grade)).toBe(label);
  });
});

describe('toConsiderationToken', () => {
  it.each([
    ['spare_quota', 'spare_quota'],
    [null, 'none'],
  ])('stores the Select value %s as %s', (value, token) => {
    expect(toConsiderationToken(value)).toBe(token);
  });
});

describe('groupSelectionRows', () => {
  /** Builds a projected selection row with one id and verdict. */
  function selectionRow(id: string, verdict: 'approved' | 'rejected') {
    return { ...toSelectionRows([row({ id, animeId: `anime-${id}` })], 4)[0], verdict };
  }

  it('splits the rows into an Approved then a Rejected group, keeping each group in row order', () => {
    const rows = [selectionRow('a1', 'approved'), selectionRow('a2', 'approved'), selectionRow('r1', 'rejected'), selectionRow('r2', 'rejected')];

    const groups = groupSelectionRows(rows);

    expect(groups.map((group) => [group.verdict, group.label, group.rows.map((r) => r.id)])).toEqual([
      ['approved', 'Approved', ['a1', 'a2']],
      ['rejected', 'Rejected', ['r1', 'r2']],
    ]);
  });

  it.each([
    ['approved', 'Approved'],
    ['rejected', 'Rejected'],
  ] as const)('leaves out the empty group when every row is %s', (verdict, label) => {
    const groups = groupSelectionRows([selectionRow('x', verdict)]);

    expect(groups.map((group) => group.label)).toEqual([label]);
  });

  it('returns no group for no rows', () => {
    expect(groupSelectionRows([])).toEqual([]);
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
