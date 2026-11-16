import { describe, expect, it } from 'vitest';
import { normalizeStoredCoverPath, planAnimeCoverRequests, toAnimeCoverEntry, toAnimeCoverQueryEntry } from '../anime-cover.helpers';

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

describe('toAnimeCoverQueryEntry', () => {
  /** A cover query result, settled as a success by default. */
  const query = (overrides: Partial<Parameters<typeof toAnimeCoverQueryEntry>[1]> = {}) => ({
    status: 'success' as const,
    data: { source: 'cover', dataUrl: 'data:a' },
    error: null,
    isFetching: false,
    isPlaceholderData: false,
    ...overrides,
  });

  it.each([
    { name: 'a gated-off read', isEnabled: false, result: query(), expected: { status: 'placeholder' } },
    { name: 'a pending read', isEnabled: true, result: query({ status: 'pending', data: undefined }), expected: { status: 'loading' } },
    { name: "the previous anime's cover", isEnabled: true, result: query({ isPlaceholderData: true }), expected: { status: 'loading' } },
    { name: 'a failed read', isEnabled: true, result: query({ status: 'error', data: undefined, error: new Error('anime is starting') }), expected: { status: 'placeholder' } },
    { name: 'a loaded cover', isEnabled: true, result: query(), expected: { status: 'cover', dataUrl: 'data:a' } },
    { name: 'a loaded placeholder', isEnabled: true, result: query({ data: { source: 'placeholder' } }), expected: { status: 'placeholder' } },
  ])('maps $name', ({ isEnabled, result, expected }) => {
    expect(toAnimeCoverQueryEntry(isEnabled, result)).toEqual(expected);
  });
});
