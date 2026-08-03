import { describe, expect, it } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source/season-source.types';
import { formatAvailableEpisodes, getScheduledDay, getSinVerAvailabilityIndicator, groupCreatedBySection } from '../daily-board.helpers';

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
    sectionOrder: 0,
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

  it('routes weekday-scheduled (graduated) animes to Visto, never Sin ver', () => {
    const rows = [
      row({ id: 'a', section: 'Domingo' }),
      row({ id: 'b', section: 'Lunes' }),
      row({ id: 'c', section: 'Visto' }),
      row({ id: 'd', section: 'Sin ver' }),
    ];
    const groups = groupCreatedBySection(rows);

    expect(groups.sinVer.map((r) => r.id)).toEqual(['d']);
    expect(groups.visto.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('getScheduledDay', () => {
  it('returns the weekday with its order for a graduated row', () => {
    expect(getScheduledDay(row({ section: 'Domingo', sectionOrder: 2 }))).toBe('Domingo - 2');
    expect(getScheduledDay(row({ section: 'Miércoles', sectionOrder: 1 }))).toBe('Miércoles - 1');
  });

  it('omits the order when it is unknown (0)', () => {
    expect(getScheduledDay(row({ section: 'Domingo', sectionOrder: 0 }))).toBe('Domingo');
  });

  it('returns null for Estrenos sections and unknown values', () => {
    expect(getScheduledDay(row({ section: 'Sin ver', sectionOrder: 1 }))).toBeNull();
    expect(getScheduledDay(row({ section: 'Visto', sectionOrder: 3 }))).toBeNull();
    expect(getScheduledDay(row({ section: '' }))).toBeNull();
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
