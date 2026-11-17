import { vi } from 'vitest';
import type { SeasonAnimeRow, SeasonQuerySource, SeasonSource } from '../../../shared/contracts/season.types';

/** The open season the screens read unless a case overrides it. */
const OPEN_SEASON = { id: 'season-1', name: 'Julio 2026', minApprovalGrade: 4, slots: 12, status: 'open', createdAt: 0 } as const;

/**
 * Builds the season port the season screen hooks are driven through: every read
 * answers "nothing" and every command answers `ok` unless a case overrides it.
 * @param overrides The ports a case spells out.
 * @returns The port.
 */
export function makeSeasonPort(overrides: Partial<SeasonSource & SeasonQuerySource> = {}): SeasonSource & SeasonQuerySource {
  /** A command binding that answered `ok`. */
  const ok = () => vi.fn().mockResolvedValue('ok');
  return {
    readSeason: vi.fn().mockResolvedValue(OPEN_SEASON),
    readSeasonAnimes: vi.fn().mockResolvedValue([] as readonly SeasonAnimeRow[]),
    readSeasons: vi.fn().mockResolvedValue([]),
    readPastSeason: vi.fn().mockResolvedValue(null),
    readPastSeasonAnimes: vi.fn().mockResolvedValue([] as readonly SeasonAnimeRow[]),
    getSeason: vi.fn().mockResolvedValue(OPEN_SEASON),
    getSeasonAnimes: vi.fn().mockResolvedValue([] as readonly SeasonAnimeRow[]),
    listSeasons: vi.fn().mockResolvedValue([]),
    getPastSeason: vi.fn().mockResolvedValue(null),
    getPastSeasonAnimes: vi.fn().mockResolvedValue([]),
    getOrderingBoard: vi.fn().mockResolvedValue({ rail: [], grid: [] }),
    getCheckTime: vi.fn().mockResolvedValue('21:00'),
    createSeason: ok(),
    setMinApprovalGrade: ok(),
    setSlots: ok(),
    closeSeason: ok(),
    reconcileIntake: ok(),
    sendToVerHoy: vi.fn().mockResolvedValue({ pastDownloadTime: false, downloadTime: '21:00' }),
    triggerSeasonDownloads: vi.fn().mockResolvedValue(undefined),
    downloadSeasonAnimes: vi.fn().mockResolvedValue(undefined),
    runMatching: ok(),
    resolveMatch: ok(),
    discardName: ok(),
    restoreName: ok(),
    setAnimeDays: ok(),
    setGrade: ok(),
    skipGrading: ok(),
    setConsideration: ok(),
    setSeasonAnimeMetadata: ok(),
    createSeasonAnimes: ok(),
    saveOrderingDraft: ok(),
    applySchedule: vi.fn().mockResolvedValue({ status: 'ok', applied: 0, failed: [] }),
    reopenOrdering: ok(),
    recheckAvailability: ok(),
    confirmSelection: vi.fn().mockResolvedValue({ status: 'ok', approved: 0, rejected: 0, quotaExceeded: false }),
    setCheckTime: ok(),
    pickFolder: vi.fn().mockResolvedValue(''),
    openPage: vi.fn(),
    ...overrides,
  };
}

/**
 * Builds one created season anime row, the shape the Daily board and the
 * Evaluation list both read.
 * @param overrides The fields a case spells out.
 * @returns The row.
 */
export function makeCreatedRow(overrides: Partial<SeasonAnimeRow> = {}): SeasonAnimeRow {
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
 * A promise a case settles by hand, so a test can observe the state while a
 * command is still running instead of only after it settled.
 * @returns The pending promise and its two settlers.
 */
export function deferred<T>() {
  /** Settles the promise successfully. */
  let resolve!: (value: T) => void;
  /** Fails the promise. */
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, reject, resolve };
}
