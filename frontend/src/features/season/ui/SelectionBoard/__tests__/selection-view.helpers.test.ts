import { describe, expect, it } from 'vitest';

import { CONSIDERATION_NONE } from '../selection-board.constants';
import type { SelectionRow, SelectionViewCriteria, Verdict } from '../selection-board.types';
import {
  countSelectionFilterValues,
  filterSelectionRows,
  formatSelectionFiltersLabel,
  formatSelectionShowLabel,
  formatSelectionVisibleCount,
  hasSelectionViewCriteria,
  sortSelectionRows,
  toSelectionFilterGroups,
  toSelectionFilterTagKeys,
  toSelectionFilterValues,
  toSelectionViewSummary,
} from '../selection-view.helpers';

/** Builds one candidate row; every field not named keeps a plausible default. */
function row(id: string, overrides: Partial<SelectionRow> = {}): SelectionRow {
  return {
    id,
    animeId: `anime-${id}`,
    rawName: `Anime ${id}`,
    grade: 4,
    consideration: CONSIDERATION_NONE,
    verdict: 'approved',
    folderPath: '',
    pageUrl: '',
    hasFolder: false,
    hasPage: false,
    ...overrides,
  };
}

/** Builds view criteria from the three dimensions, defaulting each to unrestricted. */
function criteria(overrides: Partial<SelectionViewCriteria> = {}): SelectionViewCriteria {
  return { grades: [], verdicts: [], considerations: [], sort: 'original', ...overrides };
}

/** The candidate set the view criteria are exercised against. */
const ROWS: readonly SelectionRow[] = [
  row('a1', { grade: 6, verdict: 'approved' }),
  row('a2', { grade: 4, verdict: 'approved' }),
  row('a3', { grade: 0, verdict: 'approved', consideration: 'temporarily_approved' }),
  row('a4', { grade: 3, verdict: 'approved', consideration: 'spare_quota' }),
  row('r1', { grade: 5, verdict: 'rejected', consideration: 'insufficient_quota' }),
  row('r2', { grade: 1, verdict: 'rejected' }),
  row('r3', { grade: 0, verdict: 'rejected' }),
];

/** Maps rows to their ids, so expectations read as id lists. */
const ids = (rows: readonly SelectionRow[]) => rows.map((entry) => entry.id);

describe('filterSelectionRows', () => {
  it.each([
    ['no criteria keeps every row', criteria(), ['a1', 'a2', 'a3', 'a4', 'r1', 'r2', 'r3']],
    ['grades OR together', criteria({ grades: ['6', '1'] }), ['a1', 'r2']],
    ['the ungraded grade filters on None', criteria({ grades: ['0'] }), ['a3', 'r3']],
    ['verdicts OR together', criteria({ verdicts: ['rejected'] }), ['r1', 'r2', 'r3']],
    ['considerations OR together', criteria({ considerations: ['spare_quota', 'insufficient_quota'] }), ['a4', 'r1']],
    ['dimensions AND together', criteria({ grades: ['0'], verdicts: ['approved'] }), ['a3']],
    ['an approved low grade survives a consideration filter', criteria({ considerations: ['temporarily_approved'], verdicts: ['approved'] }), ['a3']],
    ['an empty intersection returns no row', criteria({ grades: ['6'], verdicts: ['rejected'] }), []],
  ])('%s', (_name, view, expected) => {
    expect(ids(filterSelectionRows(ROWS, view))).toEqual(expected);
  });

  it('never mutates the rows it filters', () => {
    const before = ids(ROWS);
    filterSelectionRows(ROWS, criteria({ grades: ['6'] }));
    expect(ids(ROWS)).toEqual(before);
  });
});

describe('sortSelectionRows', () => {
  it('keeps Approved before Rejected in every mode', () => {
    for (const sort of ['original', 'grade-desc', 'grade-asc', 'name-asc', 'name-desc'] as const) {
      const verdicts = sortSelectionRows(ROWS, sort).map((entry) => entry.verdict);
      expect(verdicts.slice(0, 4)).toEqual(['approved', 'approved', 'approved', 'approved']);
      expect(verdicts.slice(4)).toEqual(['rejected', 'rejected', 'rejected']);
    }
  });

  it('sorts grades high to low and low to high, with None last in both directions', () => {
    expect(ids(sortSelectionRows(ROWS, 'grade-desc'))).toEqual(['a1', 'a2', 'a4', 'a3', 'r1', 'r2', 'r3']);
    expect(ids(sortSelectionRows(ROWS, 'grade-asc'))).toEqual(['a4', 'a2', 'a1', 'a3', 'r2', 'r1', 'r3']);
  });

  it('sorts titles in both directions', () => {
    const named = [
      row('b', { rawName: 'Beta', verdict: 'approved' }),
      row('c', { rawName: 'Alpha', verdict: 'approved' }),
      row('d', { rawName: 'Gamma', verdict: 'rejected' }),
      row('e', { rawName: 'Delta', verdict: 'rejected' }),
    ];
    expect(ids(sortSelectionRows(named, 'name-asc'))).toEqual(['c', 'b', 'e', 'd']);
    expect(ids(sortSelectionRows(named, 'name-desc'))).toEqual(['b', 'c', 'd', 'e']);
  });

  it('keeps the current order for ties and for the original mode', () => {
    const tied = [row('x1', { grade: 4 }), row('x2', { grade: 4 }), row('x3', { grade: 4 })];
    expect(ids(sortSelectionRows(tied, 'grade-desc'))).toEqual(['x1', 'x2', 'x3']);
    expect(ids(sortSelectionRows(ROWS, 'original'))).toEqual(ids(ROWS));
  });

  it('copies before sorting so the source order is untouched', () => {
    const input = ROWS.slice();
    const result = sortSelectionRows(input, 'grade-desc');
    expect(ids(input)).toEqual(ids(ROWS));
    expect(result).not.toBe(input);
    expect(sortSelectionRows(input, 'original')).not.toBe(input);
  });

  it('keeps the incoming order in the original mode even when titles would reorder', () => {
    const named = [
      row('z', { rawName: 'Zulu', verdict: 'approved' }),
      row('m', { rawName: 'Mike', verdict: 'approved' }),
      row('a', { rawName: 'Alpha', verdict: 'rejected' }),
    ];
    expect(ids(sortSelectionRows(named, 'original'))).toEqual(['z', 'm', 'a']);
  });

  it('breaks ties by position, not by arithmetic on positions', () => {
    const tied = [
      row('late', { grade: 4, rawName: 'Zulu', verdict: 'approved' }),
      row('early', { grade: 4, rawName: 'Alpha', verdict: 'approved' }),
      row('middle', { grade: 4, rawName: 'Mike', verdict: 'approved' }),
    ];
    for (const sort of ['grade-desc', 'grade-asc'] as const) {
      expect(ids(sortSelectionRows(tied, sort))).toEqual(['late', 'early', 'middle']);
    }
  });
});

describe('countSelectionFilterValues', () => {
  it.each([
    [criteria(), 0],
    [criteria({ grades: ['6', '1'] }), 2],
    [criteria({ grades: ['6'], verdicts: ['approved', 'rejected'], considerations: [CONSIDERATION_NONE] }), 4],
  ])('counts the selected values (%o)', (view, expected) => {
    expect(countSelectionFilterValues(view)).toBe(expected);
  });
});

describe('hasSelectionViewCriteria', () => {
  it.each([
    [criteria(), false],
    [criteria({ sort: 'grade-desc' }), true],
    [criteria({ considerations: ['spare_quota'] }), true],
  ])('reports whether anything but the default view is active (%o)', (view, expected) => {
    expect(hasSelectionViewCriteria(view)).toBe(expected);
  });
});

describe('filter labels', () => {
  it.each([
    [0, 'Filters'],
    [2, 'Filters, 2 active'],
  ])('renders the trigger label for %i active values', (count, label) => {
    expect(formatSelectionFiltersLabel(count)).toBe(label);
  });

  it.each([
    [1, 'Show 1 candidate'],
    [24, 'Show 24 candidates'],
  ])('renders the popover close action for %i matches', (count, label) => {
    expect(formatSelectionShowLabel(count)).toBe(label);
  });

  it.each([
    [1, 1, '1 of 1 candidate'],
    [24, 24, '24 of 24 candidates'],
    [0, 24, '0 of 24 candidates'],
  ])('renders the visible/total count %i of %i', (visible, total, label) => {
    expect(formatSelectionVisibleCount(visible, total)).toBe(label);
  });
});

describe('filter tag keys', () => {
  it.each([
    ['an unrestricted dimension shows All', [], ['all']],
    ['a restricted dimension shows its values', ['approved', 'rejected'], ['approved', 'rejected']],
  ])('%s', (_name, values, keys) => {
    expect(toSelectionFilterTagKeys(values)).toEqual(keys);
  });

  it.each([
    ['a plain selection keeps its values', ['approved'], ['approved']],
    ['adding a value to All keeps only the specifics', ['all', '1'], ['1']],
    ['clicking All from specifics clears the dimension', ['1', 'all'], []],
  ])('%s', (_name, keys, expected) => {
    const previous = keys.includes('all') && keys.length === 2 ? (keys[0] === 'all' ? [] : ['1']) : keys;
    expect(toSelectionFilterValues(keys, previous)).toEqual(expected);
  });
});

describe('toSelectionFilterGroups', () => {
  it('lists the three dimensions with their real vocabulary', () => {
    const groups = toSelectionFilterGroups();
    expect(groups.map((group) => [group.key, group.label])).toEqual([
      ['grades', 'Grade'],
      ['verdicts', 'Verdict'],
      ['considerations', 'Consideration'],
    ]);
    expect(groups[0].options.map((option) => option.label)).toEqual(['1', '2', '3', '4', '5', '6', 'None']);
    expect(groups[1].options.map((option) => option.label)).toEqual(['Approved', 'Rejected']);
    expect(groups[2].options.map((option) => option.label)).toEqual(['None', 'Insufficient quota', 'Temporarily approved', 'Spare quota']);
  });
});

describe('toSelectionViewSummary', () => {
  it('reports All for every unrestricted dimension', () => {
    expect(toSelectionViewSummary(criteria())).toEqual([
      { label: 'Grade', value: 'All' },
      { label: 'Verdict', value: 'All' },
      { label: 'Consideration', value: 'All' },
    ]);
  });

  it('lists the selected values in vocabulary order, whatever the selection order', () => {
    const view = criteria({ grades: ['6', '1'], verdicts: ['rejected' as Verdict], considerations: ['spare_quota', CONSIDERATION_NONE] });
    expect(toSelectionViewSummary(view)).toEqual([
      { label: 'Grade', value: '1, 6' },
      { label: 'Verdict', value: 'Rejected' },
      { label: 'Consideration', value: 'None, Spare quota' },
    ]);
  });
});
