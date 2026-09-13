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

  it('never emits Download page, Folder, Watched episodes, the watching estado, or premiere date -- non-negotiable #7, Editor half', () => {
    const patch = toEditorDraftPatch(selection());

    expect(patch).not.toHaveProperty('page');
    expect(patch).not.toHaveProperty('folder');
    expect(patch).not.toHaveProperty('progress');
    expect(patch).not.toHaveProperty('status');
    expect(patch).not.toHaveProperty('premieredAt');
  });

  it('leaves kind absent, rather than defaulted, when the selection carries no mapped kind -- non-negotiable #6', () => {
    const patch = toEditorDraftPatch(selection({ kind: undefined }));

    expect(patch).not.toHaveProperty('kind');
  });

  it('leaves coverType/coverPath absent when the selection carries no cover URL', () => {
    const patch = toEditorDraftPatch(selection({ coverURL: undefined }));

    expect(patch).not.toHaveProperty('coverType');
    expect(patch).not.toHaveProperty('coverPath');
  });

  it('omits every optional field the selection left unmapped, keeping only name', () => {
    const patch = toEditorDraftPatch({ name: 'Bleach', unfilled: ['kind', 'duration'] });

    // toStrictEqual (not toEqual) so a key present with an `undefined` value --
    // rather than genuinely absent -- fails this assertion too.
    expect(patch).toStrictEqual({ name: 'Bleach' });
  });
});
