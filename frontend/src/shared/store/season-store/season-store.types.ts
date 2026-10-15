import type {
  ConfirmSelectionResult,
  SeasonAnimeRow,
  SeasonCreateMetadata,
  SeasonMatchingPhase,
  SeasonMatchingProgressNotice,
  SeasonSnapshot,
  SeasonSource,
  SendToVerHoyResult,
} from '../../../infrastructure/season-source/season-source.types';

/** Request state of the open season's animes: `loaded` rows stay on screen across refetches. */
export type AnimesLoadState = 'idle' | 'loading' | 'loaded' | 'failed';

/**
 * Ephemeral matching-run progress: the run total plus how many rows resolved
 * in the current phase. Session-only by an explicit decision -- never
 * persisted, never written to the backend, gone when the panel goes away --
 * and carrying no per-state counters, which stay derived from the rows.
 */
export interface SeasonMatchingRun {
  /** How many rows this run will attempt, from the started event. */
  readonly total: number;
  /** How many rows resolved in the current phase so far. */
  readonly resolvedInPhase: number;
  /** The phase the latest resolved row belongs to, naming the progress. */
  readonly phase: SeasonMatchingPhase;
}

/** Zustand state contract for the shared Season read-model. */
export type SeasonStoreState = {
  readonly season: SeasonSnapshot | null;
  readonly seasonAnimes: readonly SeasonAnimeRow[];
  readonly hasLoaded: boolean;
  readonly hasLoadedAnimes: boolean;
  readonly animesLoadState: AnimesLoadState;
  readonly errorMessage?: string;
  readonly busyMessage?: string;
  /** Ephemeral matching-run progress, null while no run is in flight. */
  readonly matchingRun: SeasonMatchingRun | null;
  /** Records the run total a started event opened, resetting the phase count. */
  readonly beginMatchingRun: (total: number) => void;
  /**
   * Patches the resolved row in place and advances the phase count while a
   * run is in flight. A progress event with no run around it (the scheduled
   * availability refresh) patches the row but starts no run.
   */
  readonly applyMatchingProgress: (notice: SeasonMatchingProgressNotice) => void;
  /** Drops the ephemeral run state, e.g. on the terminal signal. */
  readonly finishMatchingRun: () => void;
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
    metadata: Readonly<Record<string, SeasonCreateMetadata>>,
  ) => Promise<void>;
  readonly setSeasonAnimeMetadata: (source: SeasonSource, rowId: string, metadataJSON: string) => Promise<void>;
  readonly recheckAvailability: (source: SeasonSource) => Promise<void>;
  readonly viewSeasonId: string | null;
  readonly readOnly: boolean;
  readonly pastSeasons: readonly SeasonSnapshot[];
  readonly loadPastSeasons: (source?: SeasonSource) => Promise<void>;
  readonly viewPastSeason: (source: SeasonSource, seasonId: string) => Promise<void>;
  readonly exitPastSeason: (source?: SeasonSource) => Promise<void>;
};
