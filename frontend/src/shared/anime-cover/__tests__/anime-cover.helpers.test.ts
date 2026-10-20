import { describe, expect, it } from 'vitest';
import { normalizeStoredCoverPath, planAnimeCoverRequests, toAnimeCoverEntry } from '../anime-cover.helpers';

describe('planAnimeCoverRequests', () => {
  it('keeps each non-empty, not yet requested id once, in order', () => {
    expect(planAnimeCoverRequests(['b', 'a', '', 'b', 'c', 'a'], new Set(['c']))).toEqual(['b', 'a']);
  });
});

describe('toAnimeCoverEntry', () => {
  it.each([
    { name: 'a cover with data', result: { source: 'cover', dataUrl: 'data:a' }, expected: { status: 'cover', dataUrl: 'data:a' } },
    { name: 'a cover without data', result: { source: 'cover' }, expected: { status: 'placeholder' } },
    { name: 'a placeholder carrying data', result: { source: 'placeholder', dataUrl: 'data:a' }, expected: { status: 'placeholder' } },
  ])('maps $name to its cache entry', ({ result, expected }) => {
    expect(toAnimeCoverEntry(result)).toEqual(expected);
  });
});

describe('normalizeStoredCoverPath', () => {
  it('trims surrounding whitespace from a valid stored path', () => {
    expect(normalizeStoredCoverPath('  C:/legacy/portadas/frieren.jpg  ')).toBe(
      'C:/legacy/portadas/frieren.jpg',
    );
  });

  it.each([[undefined], [''], ['   '], ['null']])(
    'rejects %j as an undefined (no-cover) stored path',
    (stored) => {
      expect(normalizeStoredCoverPath(stored)).toBeUndefined();
    },
  );
});
