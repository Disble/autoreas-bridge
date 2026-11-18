import { describe, expect, it } from 'vitest';

import { hasActiveAnimeEditorCriteria, isAnimeEditorListLoading } from '../anime-editor-list.helpers';
import { toAnimeEditorListLoadError } from '../anime-editor-workspace.helpers';

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

describe('hasActiveAnimeEditorCriteria', () => {
  const none = { statuses: [], kinds: [] };

  it.each<[string, string, 'all' | 'watching', { statuses: string[]; kinds: string[] }, boolean]>([
    ['nothing narrows the rail, a whitespace-only search included', '  ', 'all', none, false],
    ['a search narrows it', 'frieren', 'all', none, true],
    ['the Watching now lens narrows it', '', 'watching', none, true],
    ['a picked status narrows it', '', 'all', { statuses: ['3'], kinds: [] }, true],
    ['a picked type narrows it', '', 'all', { statuses: [], kinds: ['1'] }, true],
  ])('%s', (_case, query, filter, facets, expected) => {
    expect(hasActiveAnimeEditorCriteria(query, filter, facets)).toBe(expected);
  });
});

describe('toAnimeEditorListLoadError', () => {
  it('reports a settled failure and nothing while a retry runs or the read succeeded', () => {
    const error = new Error('anime: db closed');
    expect(toAnimeEditorListLoadError({ status: 'error', isFetching: false, error })).toBe('anime: db closed');
    expect(toAnimeEditorListLoadError({ status: 'error', isFetching: true, error })).toBeUndefined();
    expect(toAnimeEditorListLoadError({ status: 'success', isFetching: false, error: null })).toBeUndefined();
  });
});
