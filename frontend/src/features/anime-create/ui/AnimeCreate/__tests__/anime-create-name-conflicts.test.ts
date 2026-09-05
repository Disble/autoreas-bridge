import { describe, expect, it } from 'vitest';
import { findAnimeCreateNameConflicts } from '../anime-create.helpers';
import type { AnimeCreateRowDraft } from '../anime-create.types';

/** Builds a draft row carrying only the fields the conflict check reads. */
function draftRow(draftId: string, name: string): AnimeCreateRowDraft {
  return {
    draftId,
    name,
    page: '',
    folder: '',
    folderManual: false,
    kind: '0',
    episodesWatched: '',
    totalEpisodes: '',
    duration: '',
    origin: '',
    coverType: 'url',
    coverPath: '',
    genres: '',
    studios: '',
  };
}

describe('findAnimeCreateNameConflicts', () => {
  it('flags a name the catalogue already holds', () => {
    const conflicts = findAnimeCreateNameConflicts([draftRow('a', 'Comic Girls')], ['Comic Girls']);

    expect(conflicts['a']).toContain('already');
  });

  it('compares names ignoring case and surrounding space', () => {
    const conflicts = findAnimeCreateNameConflicts([draftRow('a', '  comic girls  ')], ['Comic Girls']);

    expect(conflicts['a']).toBeDefined();
  });

  it('leaves a distinct name alone', () => {
    const conflicts = findAnimeCreateNameConflicts(
      [draftRow('a', 'Tensei Shitara Slime Datta Ken OVA')],
      ['Tensei Shitara Slime Datta Ken'],
    );

    expect(conflicts['a']).toBeUndefined();
  });

  it('says nothing about a row whose name is still empty', () => {
    const conflicts = findAnimeCreateNameConflicts([draftRow('a', '   ')], ['Comic Girls']);

    expect(conflicts['a']).toBeUndefined();
  });

  it('flags the second of two rows that would take the same name', () => {
    const conflicts = findAnimeCreateNameConflicts(
      [draftRow('a', 'Comic Girls'), draftRow('b', 'comic girls')],
      [],
    );

    expect(conflicts['a']).toBeUndefined();
    expect(conflicts['b']).toBeDefined();
  });

  it('tells a batch collision apart from one against the catalogue', () => {
    const stored = findAnimeCreateNameConflicts([draftRow('a', 'Comic Girls')], ['Comic Girls']);
    const batch = findAnimeCreateNameConflicts(
      [draftRow('a', 'Comic Girls'), draftRow('b', 'Comic Girls')],
      [],
    );

    expect(stored['a']).not.toEqual(batch['b']);
  });
});
