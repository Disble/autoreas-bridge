import type { Selection } from '@heroui/react';
import { FILTER_TAG_ALL_VALUE } from './filter-tag-group.constants';

/**
 * Reads a filter group's selection when the group offers an All tag beside its
 * values: picking All clears the group, and picking a value while All is shown
 * replaces it.
 * @param selection The group's new selection.
 * @param current The values picked before this change.
 * @returns The picked values, empty when the group filters nothing.
 */
export function toFilterGroupValues(selection: Selection, current: readonly string[]): readonly string[] {
  if (selection === 'all') {
    return current;
  }
  const picked = Array.from(selection, String);
  if (current.length > 0 && picked.includes(FILTER_TAG_ALL_VALUE)) {
    return [];
  }
  return picked.filter((value) => value !== FILTER_TAG_ALL_VALUE);
}

/**
 * The tags a filter group shows selected: All while the group is empty.
 * @param values The picked values.
 * @returns The selected tag ids.
 */
export function toFilterGroupKeys(values: readonly string[]): readonly string[] {
  return values.length === 0 ? [FILTER_TAG_ALL_VALUE] : values;
}

/**
 * Whether a record's value passes one filter group: an empty group passes
 * everything, otherwise the value must be among the picked ones.
 * @param selected The group's picked values.
 * @param value The record's value, absent when it has none.
 * @returns True when the record passes the group.
 */
export function matchesFilterGroup(selected: readonly string[], value: number | undefined): boolean {
  return selected.length === 0 || selected.includes(String(value));
}

/**
 * The Filters button's accessible name, naming how many filter values are active.
 * @param activeFilterCount The picked filter values.
 * @returns The button's label.
 */
export function formatFiltersLabel(activeFilterCount: number): string {
  return activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : 'Filters';
}

/**
 * The popover's close action, naming how many anime the filters leave.
 * @param matchingCount The anime the current criteria keep.
 * @returns The action's label.
 */
export function formatShowMatchesLabel(matchingCount: number): string {
  return `Show ${matchingCount} anime`;
}
