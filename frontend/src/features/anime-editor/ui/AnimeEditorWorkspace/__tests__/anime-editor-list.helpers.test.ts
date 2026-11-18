import { describe, expect, it } from 'vitest';

import { isAnimeEditorListLoading } from '../anime-editor-list.helpers';

describe('isAnimeEditorListLoading', () => {
  it.each([
    { name: 'a first read', input: { isPending: true, isFetching: true, hasCatalog: false, isReloading: false }, loading: true },
    { name: 'a refetch with no catalog yet', input: { isPending: false, isFetching: true, hasCatalog: false, isReloading: false }, loading: true },
    { name: "the Editor's own reload", input: { isPending: false, isFetching: true, hasCatalog: true, isReloading: true }, loading: true },
    { name: 'a background refetch of a loaded catalog', input: { isPending: false, isFetching: true, hasCatalog: true, isReloading: false }, loading: false },
    { name: 'a settled catalog', input: { isPending: false, isFetching: false, hasCatalog: true, isReloading: false }, loading: false },
  ])('answers $loading for $name', ({ input, loading }) => {
    expect(isAnimeEditorListLoading(input)).toBe(loading);
  });
});
