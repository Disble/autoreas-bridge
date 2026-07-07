import { describe, expect, it } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source';
import { groupCreatedBySection } from '../daily-board.helpers';

function row(overrides: Partial<SeasonAnimeRow> = {}): SeasonAnimeRow {
  return {
    id: 'sa',
    rawName: 'Anime',
    matchStatus: 'matched',
    matchedSlug: 'x',
    candidates: [],
    availability: 'created',
    animeId: 'anime-1',
    section: 'Sin ver',
    grade: 0,
    gradeSource: '',
    skipGrading: false,
    ...overrides,
  };
}

describe('groupCreatedBySection', () => {
  it('groups created animes by their live Estrenos section', () => {
    const rows = [
      row({ id: 'a', section: 'Sin ver' }),
      row({ id: 'b', section: 'Ver hoy' }),
      row({ id: 'c', section: 'Visto' }),
      row({ id: 'd', section: '' }), // unknown → Sin ver
    ];
    const groups = groupCreatedBySection(rows);

    expect(groups.sinVer.map((r) => r.id)).toEqual(['a', 'd']);
    expect(groups.verHoy.map((r) => r.id)).toEqual(['b']);
    expect(groups.visto.map((r) => r.id)).toEqual(['c']);
  });

  it('ignores rows that are not created', () => {
    const rows = [row({ id: 'a', availability: 'waiting', matchStatus: 'pending', animeId: '', section: '' })];
    const groups = groupCreatedBySection(rows);
    expect(groups.sinVer).toHaveLength(0);
  });
});
