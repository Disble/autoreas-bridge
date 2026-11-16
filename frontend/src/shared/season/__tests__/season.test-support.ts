import { vi } from 'vitest';
import type { SeasonAnimeRow, SeasonSnapshot } from '../../contracts/season.types';
import { createModulesTestWrapper } from '../../query/test-support/bridge-modules.test-support';
import { status } from '../../query/test-support/readiness-source.test-support';
import type { SeasonDataSource } from '../season.types';

/**
 * Builds an open season snapshot, overriding only what a case sets.
 * @param overrides The fields a case sets.
 * @returns The snapshot.
 */
export function makeSeason(overrides: Partial<SeasonSnapshot> = {}): SeasonSnapshot {
  return { id: 'season-1', name: 'Julio 2026', minApprovalGrade: 4, slots: 12, status: 'open', createdAt: Date.UTC(2026, 6, 6), ...overrides };
}

/**
 * Builds one intake row, overriding only what a case sets.
 * @param overrides The fields a case sets.
 * @returns The row.
 */
export function makeSeasonRow(overrides: Partial<SeasonAnimeRow> = {}): SeasonAnimeRow {
  return {
    id: 'row-1',
    rawName: 'Naruto',
    matchStatus: 'matched',
    matchedSlug: 'naruto',
    candidates: [],
    availability: 'created',
    availableEpisodes: 0,
    animeId: 'anime-1',
    section: 'Sin ver',
    sectionOrder: 0,
    grade: 0,
    gradeSource: '',
    skipGrading: false,
    consideration: 'none',
    ...overrides,
  };
}

/**
 * A season port double: every read answers "nothing" and every command `ok`
 * unless a case overrides it.
 * @param overrides The calls a case sets.
 * @returns The source.
 */
export function createSeasonDataSource(overrides: Partial<SeasonDataSource> = {}): SeasonDataSource {
  return {
    readSeason: vi.fn().mockResolvedValue(null),
    readSeasonAnimes: vi.fn().mockResolvedValue([]),
    readSeasons: vi.fn().mockResolvedValue([]),
    readPastSeason: vi.fn().mockResolvedValue(null),
    readPastSeasonAnimes: vi.fn().mockResolvedValue([]),
    createSeason: vi.fn().mockResolvedValue('ok'),
    closeSeason: vi.fn().mockResolvedValue('ok'),
    ...overrides,
  };
}

/**
 * A query wrapper whose readiness gate reports the season module ready.
 * @returns The client and the wrapper to render with.
 */
export function seasonQueryWrapper() {
  return createModulesTestWrapper(status('season', 'ready'));
}
