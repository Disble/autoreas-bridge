import { create } from 'zustand';

import type {
  ConfirmSelectionResult,
  SeasonAnimeRow,
  SeasonSnapshot,
  SeasonSource,
  SendToVerHoyResult,
} from '../../infrastructure/season-source';
import { seasonSource } from '../../infrastructure/season-source';

interface SeasonStoreState {
  readonly season: SeasonSnapshot | null;
  readonly seasonAnimes: readonly SeasonAnimeRow[];
  readonly hasLoaded: boolean;
  readonly hasLoadedAnimes: boolean;
  readonly errorMessage?: string;
  /** A short label of the long operation currently in flight (matching, availability, …), or undefined when idle. */
  readonly busyMessage?: string;
  readonly refresh: (source?: SeasonSource) => Promise<void>;
  readonly ensureAnimesLoaded: (source?: SeasonSource) => Promise<void>;
  readonly createSeason: (source: SeasonSource, name: string) => Promise<void>;
  readonly setMinApprovalGrade: (source: SeasonSource, grade: number) => Promise<void>;
  readonly setSlots: (source: SeasonSource, slots: number) => Promise<void>;
  readonly closeSeason: (source: SeasonSource) => Promise<void>;
  readonly refreshAnimes: (source?: SeasonSource) => Promise<void>;
  readonly reconcileIntake: (source: SeasonSource, rawText: string) => Promise<void>;
  readonly runMatching: (source: SeasonSource) => Promise<void>;
  readonly resolveMatch: (source: SeasonSource, rowId: string, pageUrl: string) => Promise<void>;
  readonly discardName: (source: SeasonSource, rowId: string) => Promise<void>;
  readonly setAnimeDays: (source: SeasonSource, animeId: string, dias: readonly string[]) => Promise<void>;
  readonly sendToVerHoy: (source: SeasonSource, animeIds: readonly string[]) => Promise<SendToVerHoyResult>;
  readonly setGrade: (source: SeasonSource, animeId: string, grade: number) => Promise<void>;
  readonly skipGrading: (source: SeasonSource, rowId: string) => Promise<void>;
  readonly setConsideration: (source: SeasonSource, rowId: string, consideration: string) => Promise<void>;
  readonly confirmSelection: (source: SeasonSource) => Promise<ConfirmSelectionResult>;
  readonly createSeasonAnimes: (
    source: SeasonSource,
    rowIds: readonly string[],
    folders: Readonly<Record<string, string>>,
  ) => Promise<void>;
  readonly recheckAvailability: (source: SeasonSource) => Promise<void>;
  /** The past season being viewed read-only, or null in live/active mode. */
  readonly viewSeasonId: string | null;
  /** True while a past season is open read-only; panels hide their mutations. */
  readonly readOnly: boolean;
  /** The past-seasons history list (loaded when no season is open). */
  readonly pastSeasons: readonly SeasonSnapshot[];
  readonly loadPastSeasons: (source?: SeasonSource) => Promise<void>;
  readonly viewPastSeason: (source: SeasonSource, seasonId: string) => Promise<void>;
  readonly exitPastSeason: (source?: SeasonSource) => Promise<void>;
}

/**
 * useSeasonStore is the single frontend read-model for the active season. Wails
 * stays behind SeasonSource; this store exposes the season snapshot to the
 * workspace without direct Wails binding calls. Unlike the preferences store it
 * re-fetches after mutations (the season evolves across the workflow). There is
 * no realtime channel here: the `season_changed` signal is mobile-only and has
 * no listener in `frontend/src` — every panel refetches on mount (HeroUI Tabs
 * unmount inactive panels) and after each successful mutation instead.
 */
export const useSeasonStore = create<SeasonStoreState>((set, get) => ({
  season: null,
  seasonAnimes: [],
  hasLoaded: false,
  hasLoadedAnimes: false,
  errorMessage: undefined,
  busyMessage: undefined,
  viewSeasonId: null,
  readOnly: false,
  pastSeasons: [],

  refresh: async (source: SeasonSource = seasonSource) => {
    // While viewing a past season, the active-season fetch (mount effects,
    // realtime season_changed) must not clobber the read-only snapshot.
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

  createSeason: async (source: SeasonSource, name: string) => {
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

  loadPastSeasons: async (source: SeasonSource = seasonSource) => {
    try {
      const pastSeasons = await source.listSeasons();
      set({ pastSeasons, errorMessage: undefined });
    } catch (error) {
      set({ errorMessage: error instanceof Error ? error.message : 'Failed to load past seasons' });
    }
  },

  viewPastSeason: async (source: SeasonSource, seasonId: string) => {
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

  exitPastSeason: async (source: SeasonSource = seasonSource) => {
    // Leave read-only mode FIRST so the guarded refreshes run again.
    set({ viewSeasonId: null, readOnly: false, season: null, seasonAnimes: [], hasLoadedAnimes: false });
    await get().refresh(source);
    await get().loadPastSeasons(source);
  },

  setMinApprovalGrade: async (source: SeasonSource, grade: number) => {
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

  setSlots: async (source: SeasonSource, slots: number) => {
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

  closeSeason: async (source: SeasonSource) => {
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

  refreshAnimes: async (source: SeasonSource = seasonSource) => {
    if (get().viewSeasonId !== null) {
      return; // read-only past season: keep its loaded snapshot
    }
    try {
      const seasonAnimes = await source.getSeasonAnimes();
      set({ seasonAnimes, errorMessage: undefined });
    } catch (error) {
      set({ errorMessage: error instanceof Error ? error.message : 'Failed to load intake rows' });
    }
  },

  ensureAnimesLoaded: async (source: SeasonSource = seasonSource) => {
    if (get().hasLoadedAnimes || get().viewSeasonId !== null) {
      return;
    }
    // Mark loaded up front so concurrently-mounting cards trigger a single fetch;
    // roll back on failure so a later mount can retry.
    set({ hasLoadedAnimes: true });
    try {
      const seasonAnimes = await source.getSeasonAnimes();
      set({ seasonAnimes });
    } catch {
      set({ hasLoadedAnimes: false });
    }
  },

  reconcileIntake: async (source: SeasonSource, rawText: string) => {
    await runIntakeCommand(get, set, () => source.reconcileIntake(rawText), source, 'Failed to update intake');
  },

  runMatching: async (source: SeasonSource) => {
    await runIntakeCommand(get, set, () => source.runMatching(), source, 'Failed to run matching', 'Matching names against jkanime…');
  },

  resolveMatch: async (source: SeasonSource, rowId: string, pageUrl: string) => {
    await runIntakeCommand(get, set, () => source.resolveMatch(rowId, pageUrl), source, 'Failed to resolve match');
  },

  discardName: async (source: SeasonSource, rowId: string) => {
    await runIntakeCommand(get, set, () => source.discardName(rowId), source, 'Failed to discard name');
  },

  setAnimeDays: async (source: SeasonSource, animeId: string, dias: readonly string[]) => {
    await runIntakeCommand(get, set, () => source.setAnimeDays(animeId, dias), source, 'Failed to move anime');
  },

  sendToVerHoy: async (source: SeasonSource, animeIds: readonly string[]) => {
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

  setGrade: async (source: SeasonSource, animeId: string, grade: number) => {
    await runIntakeCommand(get, set, () => source.setGrade(animeId, grade), source, 'Failed to record grade');
  },

  skipGrading: async (source: SeasonSource, rowId: string) => {
    await runIntakeCommand(get, set, () => source.skipGrading(rowId), source, 'Failed to skip grading');
  },

  setConsideration: async (source: SeasonSource, rowId: string, consideration: string) => {
    await runIntakeCommand(get, set, () => source.setConsideration(rowId, consideration), source, 'Failed to set consideration');
  },

  createSeasonAnimes: async (source: SeasonSource, rowIds: readonly string[], folders: Readonly<Record<string, string>>) => {
    await runIntakeCommand(get, set, () => source.createSeasonAnimes(rowIds, folders), source, 'Failed to create animes', 'Creating animes…');
  },

  confirmSelection: async (source: SeasonSource) => {
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

  recheckAvailability: async (source: SeasonSource) => {
    await runIntakeCommand(get, set, () => source.recheckAvailability(), source, 'Failed to recheck availability', 'Checking chapter availability…');
  },
}));

/**
 * runIntakeCommand runs an intake mutation, surfacing a non-"ok" result as an
 * error and refreshing the rows only on success.
 */
async function runIntakeCommand(
  get: () => SeasonStoreState,
  set: (partial: Partial<SeasonStoreState>) => void,
  command: () => Promise<string>,
  source: SeasonSource,
  fallbackMessage: string,
  busyMessage?: string,
): Promise<void> {
  if (get().readOnly) {
    return; // a past season is read-only — never mutate it
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

/** Test-only seam: reset the season store back to its initial state. */
export function resetSeasonStore(): void {
  useSeasonStore.setState({
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
