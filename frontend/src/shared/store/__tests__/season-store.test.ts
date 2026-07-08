import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SeasonSnapshot, SeasonSource } from '../../../infrastructure/season-source';
import { resetSeasonStore, useSeasonStore } from '../season-store';

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
    setAnimeDays: vi.fn().mockResolvedValue('ok'),
    setGrade: vi.fn().mockResolvedValue('ok'),
    skipGrading: vi.fn().mockResolvedValue('ok'),
    setConsideration: vi.fn().mockResolvedValue('ok'),
    confirmSelection: vi.fn().mockResolvedValue({ status: 'ok', approved: 0, rejected: 0, quotaExceeded: false }),
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
    ...overrides,
  };
}

describe('useSeasonStore', () => {
  beforeEach(() => {
    resetSeasonStore();
  });

  it('refresh loads the active season', async () => {
    const source = makeSource();
    await useSeasonStore.getState().refresh(source);

    const state = useSeasonStore.getState();
    expect(state.season?.name).toBe('Julio 2026');
    expect(state.hasLoaded).toBe(true);
    expect(state.errorMessage).toBeUndefined();
  });

  it('refresh with no active season sets season to null', async () => {
    const source = makeSource({ getSeason: vi.fn().mockResolvedValue(null) });
    await useSeasonStore.getState().refresh(source);

    expect(useSeasonStore.getState().season).toBeNull();
    expect(useSeasonStore.getState().hasLoaded).toBe(true);
  });

  it('createSeason refreshes the snapshot on success', async () => {
    const source = makeSource();
    await useSeasonStore.getState().createSeason(source, 'Julio 2026');

    expect(source.createSeason).toHaveBeenCalledWith('Julio 2026');
    expect(source.getSeason).toHaveBeenCalled();
    expect(useSeasonStore.getState().season?.name).toBe('Julio 2026');
  });

  it('createSeason surfaces the error and leaves season null on failure', async () => {
    const source = makeSource({ createSeason: vi.fn().mockResolvedValue('a season is already open') });
    await useSeasonStore.getState().createSeason(source, 'Octubre 2026');

    expect(useSeasonStore.getState().season).toBeNull();
    expect(useSeasonStore.getState().errorMessage).toBe('a season is already open');
  });

  it('setMinApprovalGrade updates optimistically and keeps the value on success', async () => {
    const source = makeSource();
    await useSeasonStore.getState().refresh(source);

    await useSeasonStore.getState().setMinApprovalGrade(source, 5);

    expect(source.setMinApprovalGrade).toHaveBeenCalledWith(5);
    expect(useSeasonStore.getState().season?.minApprovalGrade).toBe(5);
  });

  it('setMinApprovalGrade rolls back on failure', async () => {
    const source = makeSource({ setMinApprovalGrade: vi.fn().mockResolvedValue('min approval grade 9 out of range 1-6') });
    await useSeasonStore.getState().refresh(source);

    await useSeasonStore.getState().setMinApprovalGrade(source, 9);

    expect(useSeasonStore.getState().season?.minApprovalGrade).toBe(4);
    expect(useSeasonStore.getState().errorMessage).toBe('min approval grade 9 out of range 1-6');
  });

  it('setSlots updates optimistically on success', async () => {
    const source = makeSource();
    await useSeasonStore.getState().refresh(source);

    await useSeasonStore.getState().setSlots(source, 9);

    expect(source.setSlots).toHaveBeenCalledWith(9);
    expect(useSeasonStore.getState().season?.slots).toBe(9);
  });

  it('reconcileIntake runs the reconcile then refreshes the rows', async () => {
    const getSeasonAnimes = vi
      .fn()
      .mockResolvedValue([{ id: 'sa-1', rawName: 'Dr. Stone', matchStatus: 'pending', matchedSlug: '', candidates: [], availability: 'waiting', availableChapters: 0, animeId: '', section: '' , grade: 0, gradeSource: '', skipGrading: false }]);
    const source = makeSource({ getSeasonAnimes });
    await useSeasonStore.getState().reconcileIntake(source, 'Dr. Stone');

    expect(source.reconcileIntake).toHaveBeenCalledWith('Dr. Stone');
    expect(useSeasonStore.getState().seasonAnimes).toHaveLength(1);
  });

  it('reconcileIntake surfaces an error and does not refresh on failure', async () => {
    const source = makeSource({ reconcileIntake: vi.fn().mockResolvedValue('no active season') });
    await useSeasonStore.getState().reconcileIntake(source, 'Dr. Stone');

    expect(source.getSeasonAnimes).not.toHaveBeenCalled();
    expect(useSeasonStore.getState().errorMessage).toBe('no active season');
  });

  it('runMatching runs then refreshes the rows', async () => {
    const source = makeSource();
    await useSeasonStore.getState().runMatching(source);
    expect(source.runMatching).toHaveBeenCalled();
    expect(source.getSeasonAnimes).toHaveBeenCalled();
  });

  it('resolveMatch delegates and refreshes', async () => {
    const source = makeSource();
    await useSeasonStore.getState().resolveMatch(source, 'sa-1', 'https://jkanime.net/dr-stone/');
    expect(source.resolveMatch).toHaveBeenCalledWith('sa-1', 'https://jkanime.net/dr-stone/');
    expect(source.getSeasonAnimes).toHaveBeenCalled();
  });

  it('discardName delegates and refreshes', async () => {
    const source = makeSource();
    await useSeasonStore.getState().discardName(source, 'sa-1');
    expect(source.discardName).toHaveBeenCalledWith('sa-1');
    expect(source.getSeasonAnimes).toHaveBeenCalled();
  });

  it('setGrade delegates the manual grade and refreshes the rows', async () => {
    const source = makeSource();
    await useSeasonStore.getState().setGrade(source, 'anime-a', 5);
    expect(source.setGrade).toHaveBeenCalledWith('anime-a', 5);
    expect(source.getSeasonAnimes).toHaveBeenCalled();
  });

  it('setGrade surfaces a manual-conflict error and does not refresh', async () => {
    const source = makeSource({ setGrade: vi.fn().mockResolvedValue('manual grade present') });
    await useSeasonStore.getState().setGrade(source, 'anime-a', 5);
    expect(source.getSeasonAnimes).not.toHaveBeenCalled();
    expect(useSeasonStore.getState().errorMessage).toBe('manual grade present');
  });

  it('skipGrading delegates and refreshes the rows', async () => {
    const source = makeSource();
    await useSeasonStore.getState().skipGrading(source, 'sa-1');
    expect(source.skipGrading).toHaveBeenCalledWith('sa-1');
    expect(source.getSeasonAnimes).toHaveBeenCalled();
  });

  it('setConsideration delegates and refreshes the rows', async () => {
    const source = makeSource();
    await useSeasonStore.getState().setConsideration(source, 'sa-1', 'spare_quota');
    expect(source.setConsideration).toHaveBeenCalledWith('sa-1', 'spare_quota');
    expect(source.getSeasonAnimes).toHaveBeenCalled();
  });

  it('createSeasonAnimes delegates the picked rows and refreshes', async () => {
    const source = makeSource();
    await useSeasonStore.getState().createSeasonAnimes(source, ['sa-1', 'sa-2'], {});
    expect(source.createSeasonAnimes).toHaveBeenCalledWith(['sa-1', 'sa-2'], {});
    expect(source.getSeasonAnimes).toHaveBeenCalled();
  });

  it('sets busyMessage while a long operation runs and clears it afterwards', async () => {
    let resolveRun: (value: string) => void = () => {};
    const runMatching = vi.fn(() => new Promise<string>((resolve) => { resolveRun = resolve; }));
    const source = makeSource({ runMatching });

    const pending = useSeasonStore.getState().runMatching(source);
    expect(useSeasonStore.getState().busyMessage).toBe('Matching names against jkanime…');

    resolveRun('ok');
    await pending;
    expect(useSeasonStore.getState().busyMessage).toBeUndefined();
  });

  it('confirmSelection refreshes season + rows and returns the result on success', async () => {
    const confirmSelection = vi.fn().mockResolvedValue({ status: 'ok', approved: 9, rejected: 3, quotaExceeded: false });
    const source = makeSource({ confirmSelection });
    const result = await useSeasonStore.getState().confirmSelection(source);
    expect(result.approved).toBe(9);
    expect(source.getSeason).toHaveBeenCalled();
    expect(source.getSeasonAnimes).toHaveBeenCalled();
    expect(useSeasonStore.getState().errorMessage).toBeUndefined();
  });

  it('confirmSelection surfaces a quota block without refreshing', async () => {
    const confirmSelection = vi
      .fn()
      .mockResolvedValue({ status: 'approved animes exceed the season slots', approved: 13, rejected: 0, quotaExceeded: true });
    const source = makeSource({ confirmSelection });
    const result = await useSeasonStore.getState().confirmSelection(source);
    expect(result.quotaExceeded).toBe(true);
    expect(source.getSeasonAnimes).not.toHaveBeenCalled();
    expect(useSeasonStore.getState().errorMessage).toBe('approved animes exceed the season slots');
  });

  it('ensureAnimesLoaded fetches once and dedupes concurrent callers', async () => {
    const getSeasonAnimes = vi.fn().mockResolvedValue([]);
    const source = makeSource({ getSeasonAnimes });

    await Promise.all([
      useSeasonStore.getState().ensureAnimesLoaded(source),
      useSeasonStore.getState().ensureAnimesLoaded(source),
    ]);
    await useSeasonStore.getState().ensureAnimesLoaded(source);

    expect(getSeasonAnimes).toHaveBeenCalledTimes(1);
    expect(useSeasonStore.getState().hasLoadedAnimes).toBe(true);
  });

  it('ensureAnimesLoaded allows a retry after a failed load', async () => {
    const getSeasonAnimes = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue([]);
    const source = makeSource({ getSeasonAnimes });

    await useSeasonStore.getState().ensureAnimesLoaded(source);
    expect(useSeasonStore.getState().hasLoadedAnimes).toBe(false);

    await useSeasonStore.getState().ensureAnimesLoaded(source);
    expect(getSeasonAnimes).toHaveBeenCalledTimes(2);
    expect(useSeasonStore.getState().hasLoadedAnimes).toBe(true);
  });

  it('closeSeason clears the active season on success', async () => {
    const getSeason = vi
      .fn()
      .mockResolvedValueOnce(makeSeason())
      .mockResolvedValueOnce(null);
    const source = makeSource({ getSeason });
    await useSeasonStore.getState().refresh(source);

    await useSeasonStore.getState().closeSeason(source);

    expect(source.closeSeason).toHaveBeenCalled();
    expect(useSeasonStore.getState().season).toBeNull();
  });

  it('loadPastSeasons loads the history list', async () => {
    const past = [makeSeason({ id: 's-old', name: 'Abril 2026', status: 'closed' })];
    const source = makeSource({ listSeasons: vi.fn().mockResolvedValue(past) });

    await useSeasonStore.getState().loadPastSeasons(source);

    expect(useSeasonStore.getState().pastSeasons).toHaveLength(1);
    expect(useSeasonStore.getState().pastSeasons[0]?.id).toBe('s-old');
  });

  it('viewPastSeason loads a past season and its rows read-only', async () => {
    const source = makeSource({
      getPastSeason: vi.fn().mockResolvedValue(makeSeason({ id: 's-old', status: 'closed' })),
      getPastSeasonAnimes: vi
        .fn()
        .mockResolvedValue([{ id: 'sa-1', rawName: 'Naruto', matchStatus: 'matched', matchedSlug: 'x', candidates: [], availability: 'created', availableChapters: 12, animeId: 'anime-1', section: 'Visto', grade: 5, gradeSource: 'manual', skipGrading: false }]),
    });

    await useSeasonStore.getState().viewPastSeason(source, 's-old');

    const state = useSeasonStore.getState();
    expect(state.viewSeasonId).toBe('s-old');
    expect(state.readOnly).toBe(true);
    expect(state.season?.id).toBe('s-old');
    expect(state.seasonAnimes).toHaveLength(1);
  });

  it('while viewing a past season, refresh and refreshAnimes never touch the active season', async () => {
    const source = makeSource({
      getPastSeason: vi.fn().mockResolvedValue(makeSeason({ id: 's-old', status: 'closed' })),
      getPastSeasonAnimes: vi.fn().mockResolvedValue([]),
    });
    await useSeasonStore.getState().viewPastSeason(source, 's-old');

    await useSeasonStore.getState().refresh(source);
    await useSeasonStore.getState().refreshAnimes(source);

    expect(source.getSeason).not.toHaveBeenCalled();
    expect(source.getSeasonAnimes).not.toHaveBeenCalled();
    expect(useSeasonStore.getState().season?.id).toBe('s-old');
  });

  it('read-only mode blocks every workflow mutation from reaching the source', async () => {
    const source = makeSource({
      getPastSeason: vi.fn().mockResolvedValue(makeSeason({ id: 's-old', status: 'closed' })),
      getPastSeasonAnimes: vi.fn().mockResolvedValue([]),
    });
    await useSeasonStore.getState().viewPastSeason(source, 's-old');
    vi.clearAllMocks(); // ignore the load calls; keep the mock implementations

    const store = useSeasonStore.getState();
    await store.runMatching(source);
    await store.discardName(source, 'sa-1');
    await store.createSeasonAnimes(source, ['sa-1'], {});
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
    await useSeasonStore.getState().viewPastSeason(source, 's-old');

    await useSeasonStore.getState().exitPastSeason(source);

    const state = useSeasonStore.getState();
    expect(state.viewSeasonId).toBeNull();
    expect(state.readOnly).toBe(false);
    expect(source.getSeason).toHaveBeenCalled();
    expect(state.season?.id).toBe('s-open');
  });
});
