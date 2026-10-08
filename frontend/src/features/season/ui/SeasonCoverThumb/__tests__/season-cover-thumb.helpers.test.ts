import { describe, expect, it } from 'vitest';

import { planSeasonCoverRequests, toSeasonCoverEntry, toSeasonCoverThumbProps } from '../season-cover-thumb.helpers';

describe('planSeasonCoverRequests', () => {
  it('keeps each non-empty, not yet requested id once, in order', () => {
    expect(planSeasonCoverRequests(['b', 'a', '', 'b', 'c', 'a'], new Set(['c']))).toEqual(['b', 'a']);
  });
});

describe('toSeasonCoverThumbProps', () => {
  it.each([
    { name: 'an unrequested id', entry: undefined, expected: { coverSrc: undefined, isLoading: false } },
    { name: 'a pending lookup', entry: { status: 'loading' } as const, expected: { coverSrc: undefined, isLoading: true } },
    { name: 'a resolved cover', entry: { status: 'cover', dataUrl: 'data:a' } as const, expected: { coverSrc: 'data:a', isLoading: false } },
    { name: 'a placeholder', entry: { status: 'placeholder' } as const, expected: { coverSrc: undefined, isLoading: false } },
  ])('maps $name to the thumbnail props', ({ entry, expected }) => {
    expect(toSeasonCoverThumbProps(entry)).toEqual(expected);
  });
});

describe('toSeasonCoverEntry', () => {
  it.each([
    { name: 'a cover with data', result: { source: 'cover', dataUrl: 'data:a' }, expected: { status: 'cover', dataUrl: 'data:a' } },
    { name: 'a cover without data', result: { source: 'cover' }, expected: { status: 'placeholder' } },
    { name: 'a placeholder carrying data', result: { source: 'placeholder', dataUrl: 'data:a' }, expected: { status: 'placeholder' } },
  ])('maps $name to its cache entry', ({ result, expected }) => {
    expect(toSeasonCoverEntry(result)).toEqual(expected);
  });
});
