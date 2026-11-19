import { describe, expect, it } from 'vitest';
import type { AnimeMetadataSelection } from '../../../../../shared/metadata-lookup/metadata-lookup.types';
import { toEditorDraftPatch } from '../anime-editor-metadata.helpers';

/**
 * Builds a fully-mapped selection, so a test only overrides the field it
 * cares about instead of restating every one of {@link AnimeMetadataSelection}'s
 * optional fields.
 * @param overrides Per-test field replacements.
 * @returns A selection with every mapped field present.
 */
function selection(overrides: Partial<AnimeMetadataSelection> = {}): AnimeMetadataSelection {
  return {
    name: 'Shingeki no Kyojin',
    kind: '0',
    totalEpisodes: '25',
    duration: '24',
    origin: 'Manga',
    genres: 'Action, Drama',
    studios: 'Wit Studio',
    coverURL: 'https://cdn.example/aot.jpg',
    unfilled: [],
    ...overrides,
  };
}

describe('toEditorDraftPatch', () => {
  it('maps every mapped field, and the cover URL through coverType/coverPath', () => {
    const patch = toEditorDraftPatch(selection());

    expect(patch).toEqual({
      name: 'Shingeki no Kyojin',
      kind: '0',
      totalEpisodes: '25',
      duration: '24',
      origin: 'Manga',
      genres: 'Action, Drama',
      studios: 'Wit Studio',
      coverType: 'url',
      coverPath: 'https://cdn.example/aot.jpg',
    });
  });

  it('never emits Download page, Folder, Watched episodes, or the watching estado -- non-negotiable #7, Editor half', () => {
    const patch = toEditorDraftPatch(selection());

    expect(patch).not.toHaveProperty('page');
    expect(patch).not.toHaveProperty('folder');
    expect(patch).not.toHaveProperty('progress');
    expect(patch).not.toHaveProperty('status');
  });

  it('omits every field the selection left unmapped: kind absent rather than defaulted (non-negotiable #6), no cover without a URL, only name when nothing maps', () => {
    expect(toEditorDraftPatch(selection({ kind: undefined }))).not.toHaveProperty('kind');

    const coverless = toEditorDraftPatch(selection({ coverURL: undefined }));
    expect(coverless).not.toHaveProperty('coverType');
    expect(coverless).not.toHaveProperty('coverPath');

    // toStrictEqual (not toEqual) so a key present with an `undefined` value --
    // rather than genuinely absent -- fails this assertion too.
    expect(toEditorDraftPatch({ name: 'Bleach', unfilled: ['kind', 'duration'] })).toStrictEqual({ name: 'Bleach' });
  });
});
