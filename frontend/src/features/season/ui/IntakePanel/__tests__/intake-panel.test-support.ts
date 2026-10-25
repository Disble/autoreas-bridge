import { vi } from 'vitest';

import type { SeasonAnimeRow, SeasonSource } from '../../../../../infrastructure/season-source/season-source.types';
import type { AnimeMetadataSelection } from '../../../../../shared/metadata-lookup/metadata-lookup.types';
import type { AnimeMetadataLookupSource } from '../../../../../shared/metadata-lookup/ui/AnimeMetadataLookupModal/use-anime-metadata-lookup';

/**
 * Fixtures shared by the intake hook suites. They live here rather than in either
 * suite so both drive the hook with the SAME rows, ports and selections.
 */
/**
 * Builds the preferences port the hook reads the library root from, so a case
 * only states the root it cares about.
 * @param root The library root the port reports.
 * @returns A preferences port suitable for {@link useIntakePanel}.
 */
export function createLibraryRootSource(root = 'D:/Anime') {
  return {
    getLibraryRoot: vi.fn().mockResolvedValue(root),
  };
}

/**
 * Builds the season port every row mutation goes through, defaulting every call
 * to a benign no-op so a case only overrides the call it exercises.
 * @param overrides Per-test port replacements.
 * @returns A season port suitable for {@link useIntakePanel}.
 */
export function createSource(overrides: Partial<SeasonSource> = {}): SeasonSource {
  return {
    getSeason: vi.fn().mockResolvedValue(null),
    createSeason: vi.fn().mockResolvedValue('ok'),
    setMinApprovalGrade: vi.fn().mockResolvedValue('ok'),
    setSlots: vi.fn().mockResolvedValue('ok'),
    closeSeason: vi.fn().mockResolvedValue('ok'),
    getSeasonAnimes: vi.fn().mockResolvedValue([] as SeasonAnimeRow[]),
    reconcileIntake: vi.fn().mockResolvedValue('ok'),
    sendToVerHoy: vi.fn().mockResolvedValue('ok'),
    triggerSeasonDownloads: vi.fn().mockResolvedValue('ok'),
    downloadSeasonAnimes: vi.fn().mockResolvedValue('ok'),
    runMatching: vi.fn().mockResolvedValue('ok'),
    resolveMatch: vi.fn().mockResolvedValue('ok'),
    discardName: vi.fn().mockResolvedValue('ok'),
    restoreName: vi.fn().mockResolvedValue('ok'),
    setAnimeDays: vi.fn().mockResolvedValue('ok'),
    setGrade: vi.fn().mockResolvedValue('ok'),
    skipGrading: vi.fn().mockResolvedValue('ok'),
    setConsideration: vi.fn().mockResolvedValue('ok'),
    confirmSelection: vi.fn().mockResolvedValue({ status: 'ok', approved: 0, rejected: 0, quotaExceeded: false }),
    setSeasonAnimeMetadata: vi.fn().mockResolvedValue('ok'),
    createSeasonAnimes: vi.fn().mockResolvedValue('ok'),
    pickFolder: vi.fn().mockResolvedValue(''),
    listSeasons: vi.fn().mockResolvedValue([]),
    getPastSeason: vi.fn().mockResolvedValue(null),
    getPastSeasonAnimes: vi.fn().mockResolvedValue([]),
    getOrderingBoard: vi.fn().mockResolvedValue({ rail: [], grid: [] }),
    saveOrderingDraft: vi.fn().mockResolvedValue('ok'),
    applySchedule: vi.fn().mockResolvedValue({ status: 'ok', applied: 0, failed: [] }),
    reopenOrdering: vi.fn().mockResolvedValue('ok'),
    recheckAvailability: vi.fn().mockResolvedValue('ok'),
    getCheckTime: vi.fn().mockResolvedValue('21:00'),
    setCheckTime: vi.fn().mockResolvedValue('ok'),
    searchProviders: vi.fn().mockResolvedValue({ status: 'ok', pages: [] }),
    openPage: vi.fn(),
    ...overrides,
  };
}

/**
 * Builds the one MyAnimeList call pair the hook hands each row's lookup modal,
 * resolving with no candidates so no case accidentally drives a real lookup.
 * @returns A fake lookup source suitable for {@link useIntakePanel}.
 */
export function createMetadataSource(): AnimeMetadataLookupSource {
  return {
    SearchMyAnimeList: vi.fn().mockResolvedValue({ outcome: 'no_op', message: '', candidates: [] }),
    GetMyAnimeListDetail: vi.fn().mockResolvedValue({ outcome: 'no_op', message: '' }),
  };
}

/**
 * Builds an editable intake row, so a metadata case states only its id and name.
 * @param overrides Per-test row replacements.
 * @returns A pending, uncreated intake row.
 */
export function seasonRow(overrides: Partial<SeasonAnimeRow> = {}): SeasonAnimeRow {
  return {
    id: 'sa-1',
    rawName: 'Dr. Stone',
    matchStatus: 'pending',
    matchedSlug: '',
    candidates: [],
    availability: 'waiting',
    availableEpisodes: 0,
    animeId: '',
    section: '',
    sectionOrder: 0,
    grade: 0,
    gradeSource: '',
    skipGrading: false,
    consideration: 'none',
    ...overrides,
  };
}

/**
 * Builds a confirmed lookup result, carrying the two mapped fields the metadata
 * cases assert on unless a case overrides them (including their removal).
 * @param overrides Per-test selection replacements.
 * @returns A confirmed lookup selection.
 */
export function selection(overrides: Partial<AnimeMetadataSelection> = {}): AnimeMetadataSelection {
  return { name: 'Dr. Stone', kind: '0', unfilled: [], ...overrides };
}

/**
 * Builds a source whose intake list holds the given rows, so a case can change
 * the list mid-test and drive a real store refresh.
 * @param rows The rows the season port returns.
 * @returns A season port holding `rows`.
 */
export function createSourceWithRows(rows: readonly SeasonAnimeRow[]): SeasonSource {
  return createSource({ getSeasonAnimes: vi.fn().mockResolvedValue([...rows]) });
}
