import { describe, expect, it } from 'vitest';

import { getRestoredMatchStatus, narrowIntakeView, resolveIntakeView } from '../intake-view.helpers';
import { seasonRow } from './intake-panel.test-support';

describe('getRestoredMatchStatus', () => {
  it.each([
    { scenario: 'a matched page', row: { matchedSlug: 'https://jkanime.net/x/', candidates: [{ title: 'X', pageUrl: 'p', score: 0.9 }] }, expected: 'matched' },
    { scenario: 'candidates only', row: { candidates: [{ title: 'X', pageUrl: 'p', score: 0.9 }] }, expected: 'ambiguous' },
    { scenario: 'nothing found', row: {}, expected: 'pending' },
  ] as const)('restores a discarded row with $scenario as $expected', ({ row, expected }) => {
    expect(getRestoredMatchStatus(seasonRow({ ...row, matchStatus: 'discarded' }))).toBe(expected);
  });
});

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
