import { describe, expect, it } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source';
import { groupDailyBoard } from '../daily-board.helpers';

function row(overrides: Partial<SeasonAnimeRow> = {}): SeasonAnimeRow {
  return {
    id: 'sa',
    rawName: 'Anime',
    matchStatus: 'matched',
    matchedSlug: 'x',
    candidates: [],
    availability: 'waiting',
    animeId: '', section: '',
    ...overrides,
  };
}

describe('groupDailyBoard', () => {
  it('splits rows into created, waiting, and other', () => {
    const rows = [
      row({ id: 'a', availability: 'created', animeId: 'anime-a', section: '' }),
      row({ id: 'b', matchStatus: 'matched', availability: 'waiting' }),
      row({ id: 'c', matchStatus: 'ambiguous', availability: 'waiting' }),
      row({ id: 'd', matchStatus: 'discarded', availability: 'waiting' }),
    ];
    const groups = groupDailyBoard(rows);

    expect(groups.created.map((r) => r.id)).toEqual(['a']);
    expect(groups.waiting.map((r) => r.id)).toEqual(['b']);
    expect(groups.other.map((r) => r.id)).toEqual(['c', 'd']);
  });

  it('counts a created row once even if it was matched', () => {
    const groups = groupDailyBoard([row({ id: 'a', matchStatus: 'matched', availability: 'created' })]);
    expect(groups.created).toHaveLength(1);
    expect(groups.waiting).toHaveLength(0);
  });
});
