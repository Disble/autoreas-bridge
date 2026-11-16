import { describe, expect, it } from 'vitest';

import { makeSeason } from '../../../../../shared/season/__tests__/season.test-support';
import { isSeasonListWanted, narrowSeasonSectionId, toSeasonOverview } from '../season-workspace.helpers';

/** Keeps HeroUI selection keys within the workspace's declared tab identifiers. */
describe('narrowSeasonSectionId', () => {
  /** Accepts each valid workspace tab id and rejects unknown HeroUI keys. */
  it.each([
    { key: 'overview', expected: 'overview' },
    { key: 'intake', expected: 'intake' },
    { key: 'evaluation', expected: 'evaluation' },
    { key: 'selection', expected: 'selection' },
    { key: 'ordering', expected: 'ordering' },
    { key: 'unknown', expected: undefined },
    { key: 42, expected: undefined },
  ])('narrows $key to $expected', ({ key, expected }) => {
    expect(narrowSeasonSectionId(key)).toBe(expected);
  });
});

/** The past-seasons history is read only once the live read answered no open season, outside a past view. */
describe('isSeasonListWanted', () => {
  /** Wants the list only for a read live view with no season. */
  it.each([
    { isSeasonRead: true, season: null, readOnly: false, expected: true },
    { isSeasonRead: false, season: null, readOnly: false, expected: false },
    { isSeasonRead: true, season: makeSeason(), readOnly: false, expected: false },
    { isSeasonRead: true, season: null, readOnly: true, expected: false },
  ])('wants the list: $expected', ({ isSeasonRead, season, readOnly, expected }) => {
    expect(isSeasonListWanted(isSeasonRead, season, readOnly)).toBe(expected);
  });
});

/** The overview card exists only while a season is displayed. */
describe('toSeasonOverview', () => {
  /** Builds no card without a season. */
  it('builds no card without a season', () => {
    expect(toSeasonOverview(null)).toBeNull();
  });

  /** Builds the card of the displayed season. */
  it('builds the card of the displayed season', () => {
    expect(toSeasonOverview(makeSeason({ name: 'Julio 2026', slots: 9 }))).toMatchObject({ title: 'Julio 2026', statusLabel: 'Open', slots: 9 });
  });
});
