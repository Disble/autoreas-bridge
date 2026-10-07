import { describe, expect, it } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source/season-source.types';
import {
  formatAvailableEpisodes,
  getScheduledDay,
  getScheduledDayChip,
  groupCreatedBySection,
  isDailyBoardSectionShown,
  selectVerHoyRowChip,
} from '../daily-board.helpers';

/** Builds a created Sin ver season row with the given overrides. */
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

describe('getScheduledDayChip', () => {
  it.each([
    { name: 'a scheduled row', section: 'Jueves', sectionOrder: 3, expected: { label: 'Jueves - 3', color: 'accent' } },
    { name: 'an unscheduled row', section: 'Ver hoy', sectionOrder: 0, expected: null },
  ])('maps $name to its weekday chip', ({ section, sectionOrder, expected }) => {
    expect(getScheduledDayChip(row({ section, sectionOrder }))).toEqual(expected);
  });
});

describe('selectVerHoyRowChip', () => {
  it.each([
    { name: 'an open season shows the weekday chip', readOnly: false, expected: { label: 'Jueves - 3', color: 'accent' } },
    { name: 'a closed season shows no live weekday chip', readOnly: true, expected: null },
  ])('$name', ({ readOnly, expected }) => {
    expect(selectVerHoyRowChip(readOnly)(row({ section: 'Jueves', sectionOrder: 3 }))).toEqual(expected);
  });
});

describe('isDailyBoardSectionShown', () => {
  it.each([
    { boardMode: 'sections', readOnly: false, count: 0, shown: false },
    { boardMode: 'sections', readOnly: false, count: 1, shown: true },
    { boardMode: 'sections', readOnly: true, count: 0, shown: true },
    { boardMode: 'plain', readOnly: true, count: 1, shown: false },
    { boardMode: 'loading', readOnly: true, count: 0, shown: false },
    { boardMode: 'failed', readOnly: true, count: 0, shown: false },
  ] as const)('$boardMode, read-only $readOnly, $count rows → $shown', ({ boardMode, readOnly, count, shown }) => {
    expect(isDailyBoardSectionShown(boardMode, readOnly, count)).toBe(shown);
  });
});
