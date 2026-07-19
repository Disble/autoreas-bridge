import { describe, expect, it } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source';
import { formatAvailableEpisodes, getSinVerAvailabilityIndicator, groupCreatedBySection } from '../daily-board.helpers';

function row(overrides: Partial<SeasonAnimeRow> = {}): SeasonAnimeRow {
  return {
    id: 'sa',
    rawName: 'Anime',
    matchStatus: 'matched',
    matchedSlug: 'x',
    candidates: [],
    availability: 'created', availableEpisodes: 0,
    animeId: 'anime-1',
    section: 'Sin ver',
    grade: 0,
    gradeSource: '',
    skipGrading: false,
    consideration: 'none',    ...overrides,
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
    const rows = [row({ id: 'a', availability: 'waiting', availableEpisodes: 0, matchStatus: 'pending', animeId: '', section: '' })];
    const groups = groupCreatedBySection(rows);
    expect(groups.sinVer).toHaveLength(0);
  });
});

describe('formatAvailableEpisodes', () => {
  it('pluralizes "episodes" for zero', () => {
    expect(formatAvailableEpisodes(0)).toBe('0 episodes available');
  });

  it('uses the singular "episode" for exactly one', () => {
    expect(formatAvailableEpisodes(1)).toBe('1 episode available');
  });

  it('pluralizes "episodes" for more than one', () => {
    expect(formatAvailableEpisodes(5)).toBe('5 episodes available');
  });
});

describe('getSinVerAvailabilityIndicator', () => {
  it('is success with an episodes-available label when episodes are online', () => {
    expect(getSinVerAvailabilityIndicator(row({ availableEpisodes: 3 }))).toEqual({
      color: 'success',
      label: '3 episodes available',
    });
  });

  it('is danger when no episodes are online yet', () => {
    expect(getSinVerAvailabilityIndicator(row({ availableEpisodes: 0 }))).toEqual({
      color: 'danger',
      label: 'No episodes online yet',
    });
  });
});
