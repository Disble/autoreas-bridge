import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ACTIVITY_FAILURE_TYPES } from '../../../feed/activity-feed.constants';
import { createInitialFilters } from '../../../feed/activity-feed-filters.helpers';
import { NOW_MS, buildOverview } from '../../../feed/__tests__/activity-feed.fixtures';
import { useActivityFailureMenu } from '../use-activity-failure-menu';

/** An overview where only Changes failed. */
const OVERVIEW = buildOverview([{ type: 'change', lines: 4, failed: 2 }]);

/** Renders the failure menu over real filter state. */
function renderMenu() {
  return renderHook(() => {
    const [filters, setFilters] = useState(() => createInitialFilters(NOW_MS));
    return { filters, ...useActivityFailureMenu(OVERVIEW, filters, setFilters) };
  });
}

describe('useActivityFailureMenu', () => {
  it('follows the state table: the first press turns the filter on and opens, later presses close and reopen, the × turns it off', () => {
    const { result } = renderMenu();
    expect(result.current.failureButtonState).toBe('off');

    act(() => result.current.onFailureToggle());
    expect([result.current.failureButtonState, result.current.filters.failuresOnly]).toEqual(['open', true]);

    act(() => result.current.onFailureToggle());
    expect([result.current.failureButtonState, result.current.filters.failuresOnly]).toEqual(['on', true]);

    act(() => result.current.onFailureToggle());
    expect(result.current.failureButtonState).toBe('open');

    act(() => result.current.onFailureMenuEscape());
    expect([result.current.failureButtonState, result.current.filters.failuresOnly]).toEqual(['on', true]);

    act(() => result.current.onFailureClear());
    expect([result.current.failureButtonState, result.current.filters.failuresOnly]).toEqual(['off', false]);
  });

  it.each([
    ['a row toggled off keeps the picks of disabled rows', new Set<string>(), ACTIVITY_FAILURE_TYPES.filter((type) => type !== 'change')],
    ['select all picks every failure type', 'all' as const, ACTIVITY_FAILURE_TYPES],
  ])('%s', (_case, keys, expected) => {
    const { result } = renderMenu();

    act(() => result.current.onFailureTypesChange(keys));

    expect(result.current.filters.failureTypes).toEqual(expected);
  });
});
