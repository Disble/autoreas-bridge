import { describe, expect, it } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source/season-source.types';
import { findSeasonCandidate } from '../season-rate-action.helpers';

function row(overrides: Partial<SeasonAnimeRow> = {}): SeasonAnimeRow {
  return {
    id: 'sa-1',
    rawName: 'Anime',
    matchStatus: 'matched',
    matchedSlug: 'x',
    candidates: [],
    availability: 'created', availableEpisodes: 0,
    animeId: 'anime-1',
    section: 'Sin ver', sectionOrder: 0,
    grade: 0,
    gradeSource: '',
    skipGrading: false,
    consideration: 'none',    ...overrides,
  };
}

describe('findSeasonCandidate', () => {
  it('returns the created candidate linked to the anime id', () => {
    const rows = [row({ animeId: 'anime-a', grade: 4 }), row({ id: 'sa-2', animeId: 'anime-b' })];
    expect(findSeasonCandidate(rows, 'anime-a')?.grade).toBe(4);
  });

  it('returns undefined when the anime is not a created candidate', () => {
    const rows = [row({ availability: 'waiting', availableEpisodes: 0, animeId: '' })];
    expect(findSeasonCandidate(rows, 'anime-a')).toBeUndefined();
  });

  it('ignores a matching anime id that is not created yet', () => {
    const rows = [row({ availability: 'available', availableEpisodes: 0, animeId: 'anime-a' })];
    expect(findSeasonCandidate(rows, 'anime-a')).toBeUndefined();
  });
});
