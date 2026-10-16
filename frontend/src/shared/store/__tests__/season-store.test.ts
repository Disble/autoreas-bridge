import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SeasonSnapshot, SeasonSource } from '../../../infrastructure/season-source/season-source.types';
import { getSeasonStoreState, isSeasonOpen, resetSeasonStore, setSeasonStoreState } from '../season-store/season-store.helpers';

/**
 * Guards the store module boundary: the hook module composes the store through
 * `useSeasonStore` and declares no intake plumbing of its own, so the plumbing and
 * the store value stay in the store module they belong to.
 */
it('keeps the intake command helper out of the hook module', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const hookModulePath = join(process.cwd(), 'src/shared/store/season-store/season-store.ts');
  const sourceText = readFileSync(hookModulePath, 'utf8');

  expect(sourceText).not.toMatch(/async function\s+runIntakeCommand\b/);
});

/**
 * Guards the single-instance contract after the store value moved into
 * `season-store.store.ts`: the helpers accessors must read and write exactly the
 * instance the store module declares, or subscribers and tests would drift onto
 * two stores.
 */
it('shares one store instance between the store module and the helpers accessors', async () => {
  const { seasonStore } = await import('../season-store/season-store.store');

  setSeasonStoreState({ hasLoaded: true });

  expect(seasonStore.getState().hasLoaded).toBe(true);
  expect(getSeasonStoreState()).toBe(seasonStore.getState());

  resetSeasonStore();
});

/** Builds a season snapshot with the fields under test, open unless overridden. */
function makeSeason(overrides: Partial<SeasonSnapshot> = {}): SeasonSnapshot {
  return {
    id: 'season-1',
    name: 'Julio 2026',
    minApprovalGrade: 4,
    slots: 12,
    status: 'open',
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

/** The intake row `sa-1` the discard cases name in their notice. */
const ROW_SA1 = { id: 'sa-1', rawName: 'Dr. Stone', matchStatus: 'pending', matchedSlug: '', candidates: [], availability: 'waiting', availableEpisodes: 0, animeId: '', section: '', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: 'none' } as const;

/** Builds a season port stand-in whose calls all succeed, with per-test overrides. */
function makeSource(overrides: Partial<SeasonSource> = {}): SeasonSource {
  return {
    getSeason: vi.fn().mockResolvedValue(makeSeason()),
    createSeason: vi.fn().mockResolvedValue('ok'),
    setMinApprovalGrade: vi.fn().mockResolvedValue('ok'),
    setSlots: vi.fn().mockResolvedValue('ok'),
    closeSeason: vi.fn().mockResolvedValue('ok'),
    getSeasonAnimes: vi.fn().mockResolvedValue([]),
    reconcileIntake: vi.fn().mockResolvedValue('ok'),
    sendToVerHoy: vi.fn().mockResolvedValue({ status: 'ok', pastDownloadTime: false, downloadTime: '' }),
    triggerSeasonDownloads: vi.fn().mockResolvedValue('ok'),
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
    openPage: vi.fn(),
    ...overrides,
  };
}

/** One row of the shared open-season predicate table: snapshot in, answer out. */
type SeasonOpenCase = {
  /** Name of the snapshot case the row feeds the predicate. */
  readonly name: string;
  /** Snapshot the shared store would hold for that case. */
  readonly season: SeasonSnapshot | null;
  /** Answer the shared predicate must give. */
  readonly expected: boolean;
};

/** Truth table of the shared open-season predicate, one row per loadable state. */
const SEASON_OPEN_CASES: readonly SeasonOpenCase[] = [
  { name: 'the live open season', season: makeSeason(), expected: true },
  { name: 'a closed historical season', season: makeSeason({ status: 'closed' }), expected: false },
  { name: 'no loaded snapshot at all', season: null, expected: false },
];

describe('isSeasonOpen', () => {
  it.each(SEASON_OPEN_CASES)('reports $name as $expected', ({ season, expected }) => {
    expect(isSeasonOpen(season)).toBe(expected);
  });
});

describe('useSeasonStore', () => {
  beforeEach(() => {
    resetSeasonStore();
  });

  it('refresh loads the active season', async () => {
    const source = makeSource();
    await getSeasonStoreState().refresh(source);

    const state = getSeasonStoreState();
    expect(state.season?.name).toBe('Julio 2026');
    expect(state.hasLoaded).toBe(true);
    expect(state.errorMessage).toBeUndefined();
  });

  it('refresh with no active season sets season to null', async () => {
    const source = makeSource({ getSeason: vi.fn().mockResolvedValue(null) });
    await getSeasonStoreState().refresh(source);

    expect(getSeasonStoreState().season).toBeNull();
    expect(getSeasonStoreState().hasLoaded).toBe(true);
  });

  it('createSeason refreshes the snapshot on success', async () => {
    const source = makeSource();
    await getSeasonStoreState().createSeason(source, 'Julio 2026');

    expect(source.createSeason).toHaveBeenCalledWith('Julio 2026');
    expect(source.getSeason).toHaveBeenCalled();
    expect(getSeasonStoreState().season?.name).toBe('Julio 2026');
  });

  it('createSeason surfaces the error and leaves season null on failure', async () => {
    const source = makeSource({ createSeason: vi.fn().mockResolvedValue('a season is already open') });
    await getSeasonStoreState().createSeason(source, 'Octubre 2026');

    expect(getSeasonStoreState().season).toBeNull();
    expect(getSeasonStoreState().errorMessage).toBe('a season is already open');
  });

  it('setMinApprovalGrade updates optimistically and keeps the value on success', async () => {
    const source = makeSource();
    await getSeasonStoreState().refresh(source);

    await getSeasonStoreState().setMinApprovalGrade(source, 5);

    expect(source.setMinApprovalGrade).toHaveBeenCalledWith(5);
    expect(getSeasonStoreState().season?.minApprovalGrade).toBe(5);
  });

  it('setMinApprovalGrade rolls back on failure', async () => {
    const source = makeSource({ setMinApprovalGrade: vi.fn().mockResolvedValue('min approval grade 9 out of range 1-6') });
    await getSeasonStoreState().refresh(source);

    await getSeasonStoreState().setMinApprovalGrade(source, 9);

    expect(getSeasonStoreState().season?.minApprovalGrade).toBe(4);
    expect(getSeasonStoreState().errorMessage).toBe('min approval grade 9 out of range 1-6');
  });

  it('setSlots updates optimistically on success', async () => {
    const source = makeSource();
    await getSeasonStoreState().refresh(source);

    await getSeasonStoreState().setSlots(source, 9);

    expect(source.setSlots).toHaveBeenCalledWith(9);
    expect(getSeasonStoreState().season?.slots).toBe(9);
  });

  it('reconcileIntake runs the reconcile then refreshes the rows', async () => {
    const getSeasonAnimes = vi
      .fn()
      .mockResolvedValue([{ id: 'sa-1', rawName: 'Dr. Stone', matchStatus: 'pending', matchedSlug: '', candidates: [], availability: 'waiting', availableEpisodes: 0, animeId: '', section: '', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false }]);
    const source = makeSource({ getSeasonAnimes });
    await getSeasonStoreState().reconcileIntake(source, 'Dr. Stone');

    expect(source.reconcileIntake).toHaveBeenCalledWith('Dr. Stone');
    expect(getSeasonStoreState().seasonAnimes).toHaveLength(1);
  });

  it('reconcileIntake surfaces an error and does not refresh on failure', async () => {
    const source = makeSource({ reconcileIntake: vi.fn().mockResolvedValue('no active season') });
    await getSeasonStoreState().reconcileIntake(source, 'Dr. Stone');

    expect(source.getSeasonAnimes).not.toHaveBeenCalled();
    expect(getSeasonStoreState().errorMessage).toBe('no active season');
  });

  it('runMatching runs then refreshes the rows', async () => {
    const source = makeSource();
    await getSeasonStoreState().runMatching(source);
    expect(source.runMatching).toHaveBeenCalled();
    expect(source.getSeasonAnimes).toHaveBeenCalled();
  });

  it('resolveMatch delegates and refreshes', async () => {
    const source = makeSource();
    await getSeasonStoreState().resolveMatch(source, 'sa-1', 'https://jkanime.net/dr-stone/');
    expect(source.resolveMatch).toHaveBeenCalledWith('sa-1', 'https://jkanime.net/dr-stone/');
    expect(source.getSeasonAnimes).toHaveBeenCalled();
  });

  it.each([
    { action: 'discardName', lastDiscard: { rowId: 'sa-1', rawName: 'Dr. Stone', sequence: 1 } },
    { action: 'restoreName', lastDiscard: null },
  ] as const)('$action delegates, refreshes, reports the success and records $lastDiscard', async ({ action, lastDiscard }) => {
    setSeasonStoreState({ seasonAnimes: [{ ...ROW_SA1, id: 'sa-0', rawName: 'Other' }, { ...ROW_SA1 }] });
    const source = makeSource();
    await expect(getSeasonStoreState()[action](source, 'sa-1')).resolves.toBe(true);
    expect(source[action]).toHaveBeenCalledWith('sa-1');
    expect(source.getSeasonAnimes).toHaveBeenCalled();
    expect(getSeasonStoreState().lastDiscard).toEqual(lastDiscard);
  });

  it('numbers each successful discard, even of a row no longer in the list', async () => {
    const source = makeSource();
    await getSeasonStoreState().discardName(source, 'sa-1');
    await getSeasonStoreState().discardName(source, 'sa-9');
    expect(getSeasonStoreState().lastDiscard).toEqual({ rowId: 'sa-9', rawName: '', sequence: 2 });
  });

  it.each([
    { action: 'discardName', command: vi.fn().mockResolvedValue('season anime not found'), message: 'season anime not found' },
    { action: 'restoreName', command: vi.fn().mockResolvedValue('season anime not found'), message: 'season anime not found' },
    { action: 'discardName', command: vi.fn().mockResolvedValue(''), message: 'Failed to discard name' },
    { action: 'restoreName', command: vi.fn().mockResolvedValue(''), message: 'Failed to restore name' },
    { action: 'restoreName', command: vi.fn().mockRejectedValue(new Error('runtime gone')), message: 'runtime gone' },
  ] as const)('$action reports "$message" for a failed command without refreshing', async ({ action, command, message }) => {
    const source = makeSource({ [action]: command });
    await expect(getSeasonStoreState()[action](source, 'sa-1')).resolves.toBe(false);
    expect(getSeasonStoreState().errorMessage).toBe(message);
    expect(source.getSeasonAnimes).not.toHaveBeenCalled();
    expect(getSeasonStoreState().lastDiscard).toBeNull();
  });

  it('setGrade delegates the manual grade and refreshes the rows', async () => {
    const source = makeSource();
    await getSeasonStoreState().setGrade(source, 'anime-a', 5);
    expect(source.setGrade).toHaveBeenCalledWith('anime-a', 5);
    expect(source.getSeasonAnimes).toHaveBeenCalled();
  });

  it('setGrade surfaces a manual-conflict error and does not refresh', async () => {
    const source = makeSource({ setGrade: vi.fn().mockResolvedValue('manual grade present') });
    await getSeasonStoreState().setGrade(source, 'anime-a', 5);
    expect(source.getSeasonAnimes).not.toHaveBeenCalled();
    expect(getSeasonStoreState().errorMessage).toBe('manual grade present');
  });

  it('skipGrading delegates and refreshes the rows', async () => {
    const source = makeSource();
    await getSeasonStoreState().skipGrading(source, 'sa-1');
    expect(source.skipGrading).toHaveBeenCalledWith('sa-1');
    expect(source.getSeasonAnimes).toHaveBeenCalled();
  });

  it('setConsideration delegates and refreshes the rows', async () => {
    const source = makeSource();
    await getSeasonStoreState().setConsideration(source, 'sa-1', 'spare_quota');
    expect(source.setConsideration).toHaveBeenCalledWith('sa-1', 'spare_quota');
    expect(source.getSeasonAnimes).toHaveBeenCalled();
  });

  it('createSeasonAnimes delegates the picked rows, their metadata and a refresh', async () => {
    const source = makeSource();
    await getSeasonStoreState().createSeasonAnimes(source, ['sa-1', 'sa-2'], {}, { 'sa-1': { totalEpisodes: 24 } });
    expect(source.createSeasonAnimes).toHaveBeenCalledWith(['sa-1', 'sa-2'], {}, { 'sa-1': { totalEpisodes: 24 } });
    expect(source.getSeasonAnimes).toHaveBeenCalled();
  });

  it('sets busyMessage while a long operation runs and clears it afterwards', async () => {
    let resolveRun: (value: string) => void = () => {};
    const runMatching = vi.fn(() => new Promise<string>((resolve) => { resolveRun = resolve; }));
    const source = makeSource({ runMatching });

    const pending = getSeasonStoreState().runMatching(source);
    expect(getSeasonStoreState().busyMessage).toBe('Matching names against jkanime…');

    resolveRun('ok');
    await pending;
    expect(getSeasonStoreState().busyMessage).toBeUndefined();
  });

  it('createSeasonAnimes reports the creating state and its own fallback on a silent failure', async () => {
    let resolveCreate: (value: string) => void = () => {};
    const createSeasonAnimes = vi.fn(() => new Promise<string>((resolve) => { resolveCreate = resolve; }));
    const source = makeSource({ createSeasonAnimes });

    const pending = getSeasonStoreState().createSeasonAnimes(source, ['sa-1'], {}, { 'sa-1': { totalEpisodes: 24 } });
    // The panel shows this while the batch runs; without it a long create looks frozen.
    expect(getSeasonStoreState().busyMessage).toBe('Creating animes…');

    // An empty status is a failure, so the store must surface its own message
    // rather than leaving the user with a blank error.
    resolveCreate('');
    await pending;
    expect(getSeasonStoreState().busyMessage).toBeUndefined();
    expect(getSeasonStoreState().errorMessage).toBe('Failed to create animes');
  });


  it('setSeasonAnimeMetadata delegates the row write and surfaces its own fallback', async () => {
    const source = makeSource({ setSeasonAnimeMetadata: vi.fn().mockResolvedValue('') });

    await getSeasonStoreState().setSeasonAnimeMetadata(source, 'sa-1', '{kind:0}');

    expect(source.setSeasonAnimeMetadata).toHaveBeenCalledWith('sa-1', '{kind:0}');
    // An empty status is a failure, so the store must say so rather than leaving
    // the user believing a wrong lookup was cleared.
    expect(getSeasonStoreState().errorMessage).toBe('Failed to save metadata');
  });

  it('confirmSelection refreshes season + rows and returns the result on success', async () => {
    const confirmSelection = vi.fn().mockResolvedValue({ status: 'ok', approved: 9, rejected: 3, quotaExceeded: false });
    const source = makeSource({ confirmSelection });
    const result = await getSeasonStoreState().confirmSelection(source);
    expect(result.approved).toBe(9);
    expect(source.getSeason).toHaveBeenCalled();
    expect(source.getSeasonAnimes).toHaveBeenCalled();
    expect(getSeasonStoreState().errorMessage).toBeUndefined();
  });

  it('confirmSelection surfaces a quota block without refreshing', async () => {
    const confirmSelection = vi
      .fn()
      .mockResolvedValue({ status: 'approved animes exceed the season slots', approved: 13, rejected: 0, quotaExceeded: true });
    const source = makeSource({ confirmSelection });
    const result = await getSeasonStoreState().confirmSelection(source);
    expect(result.quotaExceeded).toBe(true);
    expect(source.getSeasonAnimes).not.toHaveBeenCalled();
    expect(getSeasonStoreState().errorMessage).toBe('approved animes exceed the season slots');
  });

  it('ensureAnimesLoaded fetches once and dedupes concurrent callers', async () => {
    const getSeasonAnimes = vi.fn().mockResolvedValue([]);
    const source = makeSource({ getSeasonAnimes });

    await Promise.all([
      getSeasonStoreState().ensureAnimesLoaded(source),
      getSeasonStoreState().ensureAnimesLoaded(source),
    ]);
    await getSeasonStoreState().ensureAnimesLoaded(source);

    expect(getSeasonAnimes).toHaveBeenCalledTimes(1);
    expect(getSeasonStoreState().hasLoadedAnimes).toBe(true);
  });

  it('ensureAnimesLoaded allows a retry after a failed load', async () => {
    const getSeasonAnimes = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue([]);
    const source = makeSource({ getSeasonAnimes });

    await getSeasonStoreState().ensureAnimesLoaded(source);
    expect(getSeasonStoreState().hasLoadedAnimes).toBe(false);

    await getSeasonStoreState().ensureAnimesLoaded(source);
    expect(getSeasonAnimes).toHaveBeenCalledTimes(2);
    expect(getSeasonStoreState().hasLoadedAnimes).toBe(true);
  });

  it('closeSeason clears the active season on success', async () => {
    const getSeason = vi
      .fn()
      .mockResolvedValueOnce(makeSeason())
      .mockResolvedValueOnce(null);
    const source = makeSource({ getSeason });
    await getSeasonStoreState().refresh(source);

    await getSeasonStoreState().closeSeason(source);

    expect(source.closeSeason).toHaveBeenCalled();
    expect(getSeasonStoreState().season).toBeNull();
  });

  it('loadPastSeasons loads the history list', async () => {
    const past = [makeSeason({ id: 's-old', name: 'Abril 2026', status: 'closed' })];
    const source = makeSource({ listSeasons: vi.fn().mockResolvedValue(past) });

    await getSeasonStoreState().loadPastSeasons(source);

    expect(getSeasonStoreState().pastSeasons).toHaveLength(1);
    expect(getSeasonStoreState().pastSeasons[0]?.id).toBe('s-old');
  });

  it('viewPastSeason loads a past season and its rows read-only', async () => {
    const source = makeSource({
      getPastSeason: vi.fn().mockResolvedValue(makeSeason({ id: 's-old', status: 'closed' })),
      getPastSeasonAnimes: vi
        .fn()
        .mockResolvedValue([{ id: 'sa-1', rawName: 'Naruto', matchStatus: 'matched', matchedSlug: 'x', candidates: [], availability: 'created', availableEpisodes: 12, animeId: 'anime-1', section: 'Visto', sectionOrder: 0, grade: 5, gradeSource: 'manual', skipGrading: false }]),
    });

    await getSeasonStoreState().viewPastSeason(source, 's-old');

    const state = getSeasonStoreState();
    expect(state.viewSeasonId).toBe('s-old');
    expect(state.readOnly).toBe(true);
    expect(state.season?.id).toBe('s-old');
    expect(state.seasonAnimes).toHaveLength(1);
    // The shared predicate is the contract the Today banner, nav badge and rating
    // gate read: a season opened from history is loaded, but never open.
    expect(state.season?.status).toBe('closed');
    expect(isSeasonOpen(state.season)).toBe(false);
  });

  it('while viewing a past season, refresh and refreshAnimes never touch the active season', async () => {
    const source = makeSource({
      getPastSeason: vi.fn().mockResolvedValue(makeSeason({ id: 's-old', status: 'closed' })),
      getPastSeasonAnimes: vi.fn().mockResolvedValue([]),
    });
    await getSeasonStoreState().viewPastSeason(source, 's-old');

    await getSeasonStoreState().refresh(source);
    await getSeasonStoreState().refreshAnimes(source);

    expect(source.getSeason).not.toHaveBeenCalled();
    expect(source.getSeasonAnimes).not.toHaveBeenCalled();
    expect(getSeasonStoreState().season?.id).toBe('s-old');
  });

  it('read-only mode blocks every workflow mutation from reaching the source', async () => {
    const source = makeSource({
      getPastSeason: vi.fn().mockResolvedValue(makeSeason({ id: 's-old', status: 'closed' })),
      getPastSeasonAnimes: vi.fn().mockResolvedValue([]),
    });
    await getSeasonStoreState().viewPastSeason(source, 's-old');
    vi.clearAllMocks(); // ignore the load calls; keep the mock implementations

    const store = getSeasonStoreState();
    await store.runMatching(source);
    await expect(store.discardName(source, 'sa-1')).resolves.toBe(false);
    expect(getSeasonStoreState().lastDiscard).toBeNull();
    await expect(store.restoreName(source, 'sa-1')).resolves.toBe(false);
    await store.createSeasonAnimes(source, ['sa-1'], {}, {});
    await store.setGrade(source, 'anime-1', 5);
    await store.setConsideration(source, 'sa-1', 'in');
    await store.recheckAvailability(source);
    await store.setMinApprovalGrade(source, 5);
    await store.setSlots(source, 8);
    await store.sendToVerHoy(source, ['anime-1']);
    await store.confirmSelection(source);

    for (const fn of [
      source.runMatching,
      source.discardName,
      source.restoreName,
      source.createSeasonAnimes,
      source.setGrade,
      source.setConsideration,
      source.recheckAvailability,
      source.setMinApprovalGrade,
      source.setSlots,
      source.sendToVerHoy,
      source.confirmSelection,
    ]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it('exitPastSeason returns to live mode and refetches the active season', async () => {
    const source = makeSource({
      getPastSeason: vi.fn().mockResolvedValue(makeSeason({ id: 's-old', status: 'closed' })),
      getSeason: vi.fn().mockResolvedValue(makeSeason({ id: 's-open' })),
    });
    await getSeasonStoreState().viewPastSeason(source, 's-old');

    await getSeasonStoreState().exitPastSeason(source);

    const state = getSeasonStoreState();
    expect(state.viewSeasonId).toBeNull();
    expect(state.readOnly).toBe(false);
    expect(source.getSeason).toHaveBeenCalled();
    expect(state.season?.id).toBe('s-open');
  });
});
