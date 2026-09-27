import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AnimeCoverEntry } from '../../../../../shared/anime-cover/use-anime-cover';
import type { AnimeEditorRecord } from '../../../../../shared/contracts/anime.types';
import { useAnimeEditorCover } from '../use-anime-editor-cover';

/** Builds one saved editor record carrying the given stored cover source. */
function savedRecord(coverPath?: string): AnimeEditorRecord {
  return {
    animeId: 'anime-1',
    modifiedAt: 1,
    frequent: { name: 'Frieren', status: 0, progress: 12, active: true, placements: [] },
    details: {
      genres: [],
      studios: { kind: 'values', values: [] },
      cover: coverPath === undefined ? null : { type: 'url', path: coverPath },
    },
  };
}

/** A cache holding one already-resolved thumbnail for the selected anime. */
const RESOLVED_CACHE: ReadonlyMap<string, AnimeCoverEntry> = new Map([
  ['anime-1', { dataUrl: 'data:image/jpeg;base64,x', status: 'cover' }],
]);

describe('useAnimeEditorCover', () => {
  it.each<[string, AnimeEditorRecord | undefined, ReadonlyMap<string, AnimeCoverEntry>, AnimeCoverEntry]>([
    ['no loaded record at all', undefined, RESOLVED_CACHE, { status: 'placeholder' }],
    ['a record whose stored cover was cleared', savedRecord(undefined), RESOLVED_CACHE, { status: 'placeholder' }],
    ['a record whose stored cover is the null sentinel', savedRecord('null'), RESOLVED_CACHE, { status: 'placeholder' }],
    ['a saved cover with a resolved cache entry', savedRecord('https://example.com/c.jpg'), RESOLVED_CACHE, { status: 'cover', dataUrl: 'data:image/jpeg;base64,x' }],
    ['a saved cover the cache has not resolved yet', savedRecord('D:/covers/frieren.jpg'), new Map(), { status: 'loading' }],
  ])('resolves %s', (_label, record, covers, expected) => {
    const { result } = renderHook(() => useAnimeEditorCover(record, covers));

    expect(result.current).toEqual(expected);
  });
});
