import { describe, expect, it } from 'vitest';

import { narrowIntakeView, resolveIntakeView } from '../intake-view.helpers';

describe('resolveIntakeView', () => {
  it.each([
    { view: 'active', discardedCount: 0, mode: 'list', expected: 'active' },
    { view: 'active', discardedCount: 2, mode: 'list', expected: 'active' },
    { view: 'discarded', discardedCount: 1, mode: 'list', expected: 'discarded' },
    { view: 'discarded', discardedCount: 0, mode: 'list', expected: 'active' },
    { view: 'discarded', discardedCount: 1, mode: 'raw', expected: 'active' },
  ] as const)('shows $expected for the $view view with $discardedCount discarded rows in $mode mode', ({ view, discardedCount, mode, expected }) => {
    expect(resolveIntakeView(view, discardedCount, mode)).toBe(expected);
  });
});

describe('narrowIntakeView', () => {
  it.each([
    { key: 'active', expected: 'active' },
    { key: 'discarded', expected: 'discarded' },
    { key: 'raw', expected: undefined },
    { key: 1, expected: undefined },
  ] as const)('reads the toggle key $key as $expected', ({ key, expected }) => {
    expect(narrowIntakeView(key)).toBe(expected);
  });
});
