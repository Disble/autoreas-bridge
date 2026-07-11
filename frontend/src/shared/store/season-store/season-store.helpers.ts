import { createStore } from 'zustand/vanilla';
import { seasonSource } from '../../../infrastructure/season-source/season-source.helpers';
import type { SeasonSource } from '../../../infrastructure/season-source/season-source.types';
import type { SeasonStoreState } from './season-store.types';

async function runIntakeCommand(
  get: () => SeasonStoreState,
  set: (partial: Partial<SeasonStoreState>) => void,
  command: () => Promise<string>,
  source: SeasonSource,
  fallbackMessage: string,
  busyMessage?: string,
): Promise<void> {
  if (get().readOnly) {
    return;
  }
  if (busyMessage !== undefined) {
    set({ busyMessage });
  }
  try {
    const result = await command();
    if (result !== 'ok') {
      set({ errorMessage: result || fallbackMessage });
      return;
    }
    set({ errorMessage: undefined });
    await get().refreshAnimes(source);
  } catch (error) {
    set({ errorMessage: error instanceof Error ? error.message : fallbackMessage });
  } finally {
    if (busyMessage !== undefined) {
      set({ busyMessage: undefined });
    }
  }
}

/** Vanilla backing store for the shared Season read-model. */
export const seasonStore = createStore<SeasonStoreState>()((set, get) => ({
  season: null,
  seasonAnimes: [],
  hasLoaded: false,
  hasLoadedAnimes: false,
  errorMessage: undefined,
  busyMessage: undefined,
  viewSeasonId: null,
  readOnly: false,
  pastSeasons: [],

  refresh: async (source = seasonSource) => {
    if (get().viewSeasonId !== null) {
      return;
    }
    try {
      const season = await source.getSeason();
      set({ season, hasLoaded: true, errorMessage: undefined });
    } catch (error) {
      set({
        hasLoaded: true,
        errorMessage: error instanceof Error ? error.message : 'Failed to load season',
      });
    }
  },

  createSeason: async (source, name) => {
    try {
      const result = await source.createSeason(name);
      if (result !== 'ok') {
        set({ errorMessage: result || 'Failed to create season' });
        return;
      }
      set({ errorMessage: undefined });
      await get().refresh(source);
    } catch (error) {
      set({ errorMessage: error instanceof Error ? error.message : 'Failed to create season' });
    }
  },

  loadPastSeasons: async (source = seasonSource) => {
    try {
      const pastSeasons = await source.listSeasons();
      set({ pastSeasons, errorMessage: undefined });
    } catch (error) {
      set({ errorMessage: error instanceof Error ? error.message : 'Failed to load past seasons' });
    }
  },

  viewPastSeason: async (source, seasonId) => {
    try {
      const [season, seasonAnimes] = await Promise.all([
        source.getPastSeason(seasonId),
        source.getPastSeasonAnimes(seasonId),
      ]);
      set({
        season,
        seasonAnimes,
        viewSeasonId: seasonId,
        readOnly: true,
        hasLoaded: true,
        hasLoadedAnimes: true,
        errorMessage: undefined,
      });
    } catch (error) {
      set({ errorMessage: error instanceof Error ? error.message : 'Failed to load season' });
    }
  },

  exitPastSeason: async (source = seasonSource) => {
    set({ viewSeasonId: null, readOnly: false, season: null, seasonAnimes: [], hasLoadedAnimes: false });
    await get().refresh(source);
    await get().loadPastSeasons(source);
  },

  setMinApprovalGrade: async (source, grade) => {
    if (get().readOnly) {
      return;
    }
    const previous = get().season;
    if (previous) {
      set({ season: { ...previous, minApprovalGrade: grade }, errorMessage: undefined });
    }
    try {
      const result = await source.setMinApprovalGrade(grade);
      if (result !== 'ok') {
        set({ season: previous, errorMessage: result || 'Failed to update minimum approval grade' });
      }
    } catch (error) {
      set({ season: previous, errorMessage: error instanceof Error ? error.message : 'Failed to update minimum approval grade' });
    }
  },

  setSlots: async (source, slots) => {
    if (get().readOnly) {
      return;
    }
    const previous = get().season;
    if (previous) {
      set({ season: { ...previous, slots }, errorMessage: undefined });
    }
    try {
      const result = await source.setSlots(slots);
      if (result !== 'ok') {
        set({ season: previous, errorMessage: result || 'Failed to update slots' });
      }
    } catch (error) {
      set({ season: previous, errorMessage: error instanceof Error ? error.message : 'Failed to update slots' });
    }
  },

  closeSeason: async (source) => {
    try {
      const result = await source.closeSeason();
      if (result !== 'ok') {
        set({ errorMessage: result || 'Failed to close season' });
        return;
      }
      set({ errorMessage: undefined });
      await get().refresh(source);
    } catch (error) {
      set({ errorMessage: error instanceof Error ? error.message : 'Failed to close season' });
    }
  },

  refreshAnimes: async (source = seasonSource) => {
    if (get().viewSeasonId !== null) {
      return;
    }
    try {
      const seasonAnimes = await source.getSeasonAnimes();
      set({ seasonAnimes, errorMessage: undefined });
    } catch (error) {
      set({ errorMessage: error instanceof Error ? error.message : 'Failed to load intake rows' });
    }
  },

  ensureAnimesLoaded: async (source = seasonSource) => {
    if (get().hasLoadedAnimes || get().viewSeasonId !== null) {
      return;
    }
    set({ hasLoadedAnimes: true });
    try {
      const seasonAnimes = await source.getSeasonAnimes();
      set({ seasonAnimes });
    } catch {
      set({ hasLoadedAnimes: false });
    }
  },

  reconcileIntake: async (source, rawText) => {
    await runIntakeCommand(get, set, () => source.reconcileIntake(rawText), source, 'Failed to update intake');
  },

  runMatching: async (source) => {
    await runIntakeCommand(get, set, () => source.runMatching(), source, 'Failed to run matching', 'Matching names against jkanime…');
  },

  resolveMatch: async (source, rowId, pageUrl) => {
    await runIntakeCommand(get, set, () => source.resolveMatch(rowId, pageUrl), source, 'Failed to resolve match');
  },

  discardName: async (source, rowId) => {
    await runIntakeCommand(get, set, () => source.discardName(rowId), source, 'Failed to discard name');
  },

  setAnimeDays: async (source, animeId, dias) => {
    await runIntakeCommand(get, set, () => source.setAnimeDays(animeId, dias), source, 'Failed to move anime');
  },

  sendToVerHoy: async (source, animeIds) => {
    if (get().readOnly) {
      return { status: 'read-only', pastDownloadTime: false, downloadTime: '' };
    }
    set({ busyMessage: 'Sending to Ver hoy…' });
    try {
      const result = await source.sendToVerHoy(animeIds);
      if (result.status !== 'ok') {
        set({ errorMessage: result.status || 'Failed to send to Ver hoy' });
        return result;
      }
      set({ errorMessage: undefined });
      await get().refreshAnimes(source);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send to Ver hoy';
      set({ errorMessage: message });
      return { status: message, pastDownloadTime: false, downloadTime: '' };
    } finally {
      set({ busyMessage: undefined });
    }
  },

  setGrade: async (source, animeId, grade) => {
    await runIntakeCommand(get, set, () => source.setGrade(animeId, grade), source, 'Failed to record grade');
  },

  skipGrading: async (source, rowId) => {
    await runIntakeCommand(get, set, () => source.skipGrading(rowId), source, 'Failed to skip grading');
  },

  setConsideration: async (source, rowId, consideration) => {
    await runIntakeCommand(get, set, () => source.setConsideration(rowId, consideration), source, 'Failed to set consideration');
  },

  createSeasonAnimes: async (source, rowIds, folders) => {
    await runIntakeCommand(get, set, () => source.createSeasonAnimes(rowIds, folders), source, 'Failed to create animes', 'Creating animes…');
  },

  confirmSelection: async (source) => {
    if (get().readOnly) {
      return { status: 'read-only', approved: 0, rejected: 0, quotaExceeded: false };
    }
    try {
      const result = await source.confirmSelection();
      if (result.status !== 'ok') {
        set({ errorMessage: result.status || 'Failed to confirm selection' });
        return result;
      }
      set({ errorMessage: undefined });
      await get().refresh(source);
      await get().refreshAnimes(source);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to confirm selection';
      set({ errorMessage: message });
      return { status: message, approved: 0, rejected: 0, quotaExceeded: false };
    }
  },

  recheckAvailability: async (source) => {
    await runIntakeCommand(get, set, () => source.recheckAvailability(), source, 'Failed to recheck availability', 'Checking chapter availability…');
  },
}));

/** Reads the current Season store snapshot outside React render. */
export function getSeasonStoreState(): SeasonStoreState {
  return seasonStore.getState();
}

/** Writes a partial Season store snapshot outside React render. */
export function setSeasonStoreState(partial: Partial<SeasonStoreState>): void {
  seasonStore.setState(partial);
}

/** Resets the season read-model back to its initial disconnected state for tests. */
export function resetSeasonStore(): void {
  setSeasonStoreState({
    season: null,
    seasonAnimes: [],
    hasLoaded: false,
    hasLoadedAnimes: false,
    errorMessage: undefined,
    busyMessage: undefined,
    viewSeasonId: null,
    readOnly: false,
    pastSeasons: [],
  });
}
