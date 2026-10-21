import { describe, expect, it } from 'vitest';

import { toSeasonCoverThumbProps } from '../season-cover-thumb.helpers';

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
