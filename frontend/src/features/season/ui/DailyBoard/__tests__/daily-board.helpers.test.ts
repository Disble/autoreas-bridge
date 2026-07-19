import { describe, expect, it } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source';
import { formatAvailableChapters, getSinVerAvailabilityIndicator, groupCreatedBySection } from '../daily-board.helpers';

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

describe('formatAvailableChapters', () => {
  it('pluralizes "chapters" for zero', () => {
    expect(formatAvailableChapters(0)).toBe('0 chapters available');
  });

  it('uses the singular "chapter" for exactly one', () => {
    expect(formatAvailableChapters(1)).toBe('1 chapter available');
  });

  it('pluralizes "chapters" for more than one', () => {
    expect(formatAvailableChapters(5)).toBe('5 chapters available');
  });
});

describe('getSinVerAvailabilityIndicator', () => {
  it('is success with a chapters-available label when chapters are online', () => {
    expect(getSinVerAvailabilityIndicator(row({ availableEpisodes: 3 }))).toEqual({
      color: 'success',
      label: '3 chapters available',
    });
  });

  it('is danger when no chapters are online yet', () => {
    expect(getSinVerAvailabilityIndicator(row({ availableEpisodes: 0 }))).toEqual({
      color: 'danger',
      label: 'No chapters online yet',
    });
  });
});
