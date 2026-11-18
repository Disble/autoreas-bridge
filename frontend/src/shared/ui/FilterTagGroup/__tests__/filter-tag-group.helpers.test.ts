import type { Selection } from '@heroui/react';
import { describe, expect, it } from 'vitest';
import { formatFiltersLabel, formatShowMatchesLabel, matchesFilterGroup, toFilterGroupKeys, toFilterGroupValues } from '../filter-tag-group.helpers';

describe('toFilterGroupValues and toFilterGroupKeys', () => {
  it.each<[string, Selection, readonly string[], readonly string[]]>([
    ['picking a value replaces All', new Set(['all', '1']), [], ['1']],
    ['picking another value adds it', new Set(['1', 3]), ['1'], ['1', '3']],
    ['picking All clears the group', new Set(['1', 'all']), ['1'], []],
    ['dropping the last value clears the group', new Set(), ['1'], []],
    ['select-all keeps the current values', 'all', ['1'], ['1']],
  ])('%s', (_case, selection, current, expected) => {
    expect(toFilterGroupValues(selection, current)).toEqual(expected);
  });

  it('shows All selected only while the group is empty', () => {
    expect(toFilterGroupKeys([])).toEqual(['all']);
    expect(toFilterGroupKeys(['0', '1'])).toEqual(['0', '1']);
  });
});

describe('matchesFilterGroup', () => {
  it('passes every value through an empty group and only picked values through a narrowed one', () => {
    expect(matchesFilterGroup([], 2)).toBe(true);
    expect(matchesFilterGroup([], undefined)).toBe(true);
    expect(matchesFilterGroup(['1', '3'], 3)).toBe(true);
    expect(matchesFilterGroup(['1', '3'], 2)).toBe(false);
    expect(matchesFilterGroup(['1'], undefined)).toBe(false);
  });
});

describe('formatFiltersLabel and formatShowMatchesLabel', () => {
  it('names the active filter count and the matching anime', () => {
    expect(formatShowMatchesLabel(7)).toBe('Show 7 anime');
    expect(formatFiltersLabel(0)).toBe('Filters');
    expect(formatFiltersLabel(2)).toBe('Filters, 2 active');
  });
});
