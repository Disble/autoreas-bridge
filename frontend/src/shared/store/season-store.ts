import { create } from 'zustand';

import type { SeasonAnimeRow, SeasonSnapshot, SeasonSource } from '../../infrastructure/season-source';
import { seasonSource } from '../../infrastructure/season-source';

interface SeasonStoreState {
  readonly season: SeasonSnapshot | null;
  readonly seasonAnimes: readonly SeasonAnimeRow[];
  readonly hasLoaded: boolean;
  readonly errorMessage?: string;
  readonly refresh: (source?: SeasonSource) => Promise<void>;
  readonly createSeason: (source: SeasonSource, name: string) => Promise<void>;
  readonly setMinApprovalGrade: (source: SeasonSource, grade: number) => Promise<void>;
  readonly setSlots: (source: SeasonSource, slots: number) => Promise<void>;
  readonly closeSeason: (source: SeasonSource) => Promise<void>;
  readonly refreshAnimes: (source?: SeasonSource) => Promise<void>;
  readonly importIntake: (source: SeasonSource, rawText: string) => Promise<void>;
  readonly runMatching: (source: SeasonSource) => Promise<void>;
  readonly resolveMatch: (source: SeasonSource, rowId: string, pageUrl: string) => Promise<void>;
  readonly discardName: (source: SeasonSource, rowId: string) => Promise<void>;
}

/**
 * useSeasonStore is the single frontend read-model for the active season. Wails
 * stays behind SeasonSource; this store exposes the season snapshot to the
 * workspace without direct Wails binding calls. Unlike the preferences store it
 * re-fetches after mutations (the season evolves across the workflow), and it
 * also refreshes on the `season_changed` realtime signal.
 */
export const useSeasonStore = create<SeasonStoreState>((set, get) => ({
  season: null,
  seasonAnimes: [],
  hasLoaded: false,
  errorMessage: undefined,

  refresh: async (source: SeasonSource = seasonSource) => {
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

  setMinApprovalGrade: async (source: SeasonSource, grade: number) => {
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
    try {
      const seasonAnimes = await source.getSeasonAnimes();
      set({ seasonAnimes, errorMessage: undefined });
    } catch (error) {
      set({ errorMessage: error instanceof Error ? error.message : 'Failed to load intake rows' });
    }
  },

  importIntake: async (source: SeasonSource, rawText: string) => {
    await runIntakeCommand(get, set, () => source.importIntake(rawText), source, 'Failed to import intake');
  },

  runMatching: async (source: SeasonSource) => {
    await runIntakeCommand(get, set, () => source.runMatching(), source, 'Failed to run matching');
  },

  resolveMatch: async (source: SeasonSource, rowId: string, pageUrl: string) => {
    await runIntakeCommand(get, set, () => source.resolveMatch(rowId, pageUrl), source, 'Failed to resolve match');
  },

  discardName: async (source: SeasonSource, rowId: string) => {
    await runIntakeCommand(get, set, () => source.discardName(rowId), source, 'Failed to discard name');
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
): Promise<void> {
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
  }
}

/** Test-only seam: reset the season store back to its initial state. */
export function resetSeasonStore(): void {
  useSeasonStore.setState({ season: null, seasonAnimes: [], hasLoaded: false, errorMessage: undefined });
}
