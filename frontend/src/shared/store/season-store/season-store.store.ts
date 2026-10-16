import { createStore } from 'zustand/vanilla';
import { SEASON_MATCHING_PHASE_MATCHING } from '../../../infrastructure/season-source/season-source.constants';
import { seasonSource } from '../../../infrastructure/season-source/season-source.helpers';
import type { SeasonAnimeRow, SeasonMatchingProgressNotice, SeasonSource } from '../../../infrastructure/season-source/season-source.types';
import type { AnimesLoadState, SeasonMatchingRun, SeasonStoreState } from './season-store.types';

/**
 * Runs one intake command behind the store's read-only guard, surfacing the command's
 * failure message on the state and refreshing the intake rows after a success. Shared by
 * every season workflow action so no caller repeats the busy/error plumbing.
 * @returns Whether the command ran and succeeded (false when blocked as read-only or failed).
 */
async function runIntakeCommand(
  get: () => SeasonStoreState,
  set: (partial: Partial<SeasonStoreState>) => void,
  command: () => Promise<string>,
  source: SeasonSource,
  fallbackMessage: string,
  busyMessage?: string,
): Promise<boolean> {
  if (get().readOnly) {
    return false;
  }
  if (busyMessage !== undefined) {
    set({ busyMessage });
  }
  try {
    const result = await command();
    if (result !== 'ok') {
      set({ errorMessage: result || fallbackMessage });
      return false;
    }
    set({ errorMessage: undefined });
    await get().refreshAnimes(source);
    return true;
  } catch (error) {
    set({ errorMessage: error instanceof Error ? error.message : fallbackMessage });
    return false;
  } finally {
    if (busyMessage !== undefined) {
      set({ busyMessage: undefined });
    }
  }
}

/** Starts an animes request: an already `loaded` list keeps its rows instead of regressing to `loading`. */
function startAnimesLoad(current: AnimesLoadState): AnimesLoadState {
  return current === 'loaded' ? 'loaded' : 'loading';
}

/** Fails an animes request: an already `loaded` list stays `loaded` so its rows remain on screen. */
function failAnimesLoad(current: AnimesLoadState): AnimesLoadState {
  return current === 'loaded' ? 'loaded' : 'failed';
}

/**
 * Patches one intake row with its resolved progress facts, keeping every
 * field the event does not carry. The payload carries no counters, so none
 * are stored here either.
 */
function patchRowWithProgress(row: SeasonAnimeRow, notice: SeasonMatchingProgressNotice): SeasonAnimeRow {
  return {
    ...row,
    rawName: notice.rawName,
    matchStatus: notice.matchStatus,
    matchedSlug: notice.matchedSlug,
    candidates: [...notice.candidates],
    availability: notice.availability,
    availableEpisodes: notice.availableEpisodes,
  };
}

/**
 * Advances the ephemeral run count for one resolved row: within the same
 * phase the count grows, and a phase flip restarts it under the new phase so
 * the panel never counts availability resolutions against the name total.
 * Without a run in flight (the scheduled availability refresh) there is
 * nothing to advance.
 */
function advanceMatchingRun(run: SeasonMatchingRun | null, notice: SeasonMatchingProgressNotice): SeasonMatchingRun | null {
  if (run === null) {
    return null;
  }
  if (notice.phase !== run.phase) {
    return { total: run.total, resolvedInPhase: 1, phase: notice.phase };
  }
  return { total: run.total, resolvedInPhase: run.resolvedInPhase + 1, phase: run.phase };
}

/**
 * Vanilla backing store for the shared Season read-model.
 *
 * This module owns the store value and the intake command plumbing it calls; the
 * open-season predicate and the accessors the rest of the app and its tests use live
 * in the sibling `season-store.helpers.ts`.
 */
export const seasonStore = createStore<SeasonStoreState>()((set, get) => ({
  season: null,
  seasonAnimes: [],
  hasLoaded: false,
  hasLoadedAnimes: false,
  animesLoadState: 'idle',
  errorMessage: undefined,
  busyMessage: undefined,
  matchingRun: null,
  beginMatchingRun: (total) => {
    set({ matchingRun: { total, resolvedInPhase: 0, phase: SEASON_MATCHING_PHASE_MATCHING } });
  },
  applyMatchingProgress: (notice) => {
    set((state) => ({
      seasonAnimes: state.seasonAnimes.map((row) => (row.id === notice.rowId ? patchRowWithProgress(row, notice) : row)),
      matchingRun: advanceMatchingRun(state.matchingRun, notice),
    }));
  },
  finishMatchingRun: () => {
    set({ matchingRun: null });
  },
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
        animesLoadState: 'loaded',
        errorMessage: undefined,
      });
    } catch (error) {
      set({ errorMessage: error instanceof Error ? error.message : 'Failed to load season' });
    }
  },

  exitPastSeason: async (source = seasonSource) => {
    set({ viewSeasonId: null, readOnly: false, season: null, seasonAnimes: [], hasLoadedAnimes: false, animesLoadState: 'idle' });
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
    set({ animesLoadState: startAnimesLoad(get().animesLoadState) });
    try {
      const seasonAnimes = await source.getSeasonAnimes();
      set({ seasonAnimes, animesLoadState: 'loaded', errorMessage: undefined });
    } catch (error) {
      set({
        animesLoadState: failAnimesLoad(get().animesLoadState),
        errorMessage: error instanceof Error ? error.message : 'Failed to load intake rows',
      });
    }
  },

  ensureAnimesLoaded: async (source = seasonSource) => {
    if (get().hasLoadedAnimes || get().viewSeasonId !== null) {
      return;
    }
    set({ hasLoadedAnimes: true, animesLoadState: startAnimesLoad(get().animesLoadState) });
    try {
      const seasonAnimes = await source.getSeasonAnimes();
      set({ seasonAnimes, animesLoadState: 'loaded' });
    } catch {
      set({
        hasLoadedAnimes: false,
        animesLoadState: failAnimesLoad(get().animesLoadState),
        errorMessage: 'Failed to load intake rows',
      });
    }
  },

  reconcileIntake: async (source, rawText) => {
    await runIntakeCommand(get, set, () => source.reconcileIntake(rawText), source, 'Failed to update intake');
  },

  runMatching: async (source) => {
    // Matching owns its own plumbing instead of `runIntakeCommand`: the live
    // run reports through the matching events, so the terminal signal -- not
    // the command result -- owns the authoritative reload. An infrastructure
    // abort emits no finished event, so a non-`ok` result also drops the run
    // state here, or the progress would hang forever.
    if (get().readOnly) {
      return;
    }
    set({ busyMessage: 'Matching names against jkanime…' });
    try {
      const result = await source.runMatching();
      if (result !== 'ok') {
        set({ errorMessage: result || 'Failed to run matching', matchingRun: null });
        return;
      }
      set({ errorMessage: undefined });
      if (get().matchingRun === null) {
        await get().refreshAnimes(source);
      }
    } catch (error) {
      set({ errorMessage: error instanceof Error ? error.message : 'Failed to run matching', matchingRun: null });
    } finally {
      set({ busyMessage: undefined });
    }
  },

  resolveMatch: async (source, rowId, pageUrl) => {
    await runIntakeCommand(get, set, () => source.resolveMatch(rowId, pageUrl), source, 'Failed to resolve match');
  },

  discardName: (source, rowId) => runIntakeCommand(get, set, () => source.discardName(rowId), source, 'Failed to discard name'),

  restoreName: (source, rowId) => runIntakeCommand(get, set, () => source.restoreName(rowId), source, 'Failed to restore name'),

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

  createSeasonAnimes: async (source, rowIds, folders, metadata) => {
    await runIntakeCommand(get, set, () => source.createSeasonAnimes(rowIds, folders, metadata), source, 'Failed to create animes', 'Creating animes…');
  },
  setSeasonAnimeMetadata: async (source, rowId, metadataJSON) => {
    // No busy message: the write is a single row update and the panel already
    // shows the value it just saved. A failure lands in the shared error state.
    await runIntakeCommand(get, set, () => source.setSeasonAnimeMetadata(rowId, metadataJSON), source, 'Failed to save metadata');
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
    await runIntakeCommand(get, set, () => source.recheckAvailability(), source, 'Failed to recheck availability', 'Checking episode availability…');
  },
}));
