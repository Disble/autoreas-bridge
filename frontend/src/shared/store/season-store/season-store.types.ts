import type {
  ConfirmSelectionResult,
  SeasonAnimeRow,
  SeasonSnapshot,
  SeasonSource,
  SendToVerHoyResult,
} from '../../../infrastructure/season-source/season-source.types';

/** Zustand state contract for the shared Season read-model. */
export type SeasonStoreState = {
  readonly season: SeasonSnapshot | null;
  readonly seasonAnimes: readonly SeasonAnimeRow[];
  readonly hasLoaded: boolean;
  readonly hasLoadedAnimes: boolean;
  readonly errorMessage?: string;
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
  readonly viewSeasonId: string | null;
  readonly readOnly: boolean;
  readonly pastSeasons: readonly SeasonSnapshot[];
  readonly loadPastSeasons: (source?: SeasonSource) => Promise<void>;
  readonly viewPastSeason: (source: SeasonSource, seasonId: string) => Promise<void>;
  readonly exitPastSeason: (source?: SeasonSource) => Promise<void>;
};
