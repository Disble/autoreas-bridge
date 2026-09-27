/**
 * Frontend-facing shape of the active season snapshot.
 */
export interface SeasonSnapshot {
  readonly id: string;
  readonly name: string;
  readonly minApprovalGrade: number;
  readonly slots: number;
  readonly status: string;
  readonly selectionConfirmedAt?: number;
  readonly appliedAt?: number;
  readonly closedAt?: number;
  readonly createdAt: number;
}

/** One ranked candidate for an ambiguous intake row. */
export interface SeasonAnimeCandidate {
  readonly title: string;
  readonly pageUrl: string;
  readonly score: number;
}

/** One intake or matching row of the active season. */
export interface SeasonAnimeRow {
  readonly id: string;
  readonly rawName: string;
  readonly matchStatus: string;
  readonly matchedSlug: string;
  readonly candidates: readonly SeasonAnimeCandidate[];
  readonly availability: string;
  readonly availableEpisodes: number;
  readonly animeId: string;
  readonly section: string;
  readonly sectionOrder: number;
  readonly grade: number;
  readonly gradeSource: string;
  readonly ratedAt?: number;
  readonly skipGrading: boolean;
  readonly consideration: string;
  /** Download folder of the created anime; absent/empty when none. */
  readonly folderPath?: string;
  /** Source page URL of the created anime; absent/empty when none. */
  readonly pageUrl?: string;
}

/** One anime card on the season ordering board. */
export interface OrderingCard {
  readonly animeId: string;
  readonly name: string;
  readonly dia: string;
  readonly orden: number;
  readonly section: string;
  readonly isNewcomer: boolean;
}

/** Ordering board read model: rail plus weekday grid. */
export interface OrderingBoard {
  readonly rail: readonly OrderingCard[];
  readonly grid: readonly OrderingCard[];
  readonly appliedAt?: number | null;
}

/**
 * The ordering board a season stored when it closed. `recorded` is false when no
 * board was captured — a season that closed before the closure snapshot existed,
 * or one whose payload could not be read — so history surfaces can tell "nothing
 * was recorded" apart from a genuinely empty board instead of rendering an empty
 * rail and grid as if they were the record.
 */
export interface SeasonOrderingSnapshot {
  readonly recorded: boolean;
  /** Epoch-ms instant the closure snapshot was captured, when recorded. */
  readonly capturedAt?: number;
  /** Epoch-ms instant the stored board's schedule was applied, when it had been. */
  readonly appliedAt?: number;
  readonly rail: readonly OrderingCard[];
  readonly grid: readonly OrderingCard[];
}

/** Result returned after applying the season schedule. */
export interface ApplyScheduleResult {
  readonly status: string;
  readonly applied: number;
  readonly failed: readonly string[];
}

/** Result returned after sending a batch into Ver hoy. */
export interface SendToVerHoyResult {
  readonly status: string;
  readonly pastDownloadTime: boolean;
  readonly downloadTime: string;
}

/** Result returned after confirming the season selection reconciliation. */
export interface ConfirmSelectionResult {
  readonly status: string;
  readonly approved: number;
  readonly rejected: number;
  readonly quotaExceeded: boolean;
}

/**
 * Request/reply port for season Wails bindings with browser-safe degraded fallbacks.
 */
export interface SeasonSource {
  readonly getSeason: () => Promise<SeasonSnapshot | null>;
  readonly createSeason: (name: string) => Promise<string>;
  readonly setMinApprovalGrade: (grade: number) => Promise<string>;
  readonly setSlots: (slots: number) => Promise<string>;
  readonly closeSeason: () => Promise<string>;
  readonly getSeasonAnimes: () => Promise<readonly SeasonAnimeRow[]>;
  readonly listSeasons: () => Promise<readonly SeasonSnapshot[]>;
  readonly getPastSeason: (seasonId: string) => Promise<SeasonSnapshot | null>;
  readonly getPastSeasonAnimes: (seasonId: string) => Promise<readonly SeasonAnimeRow[]>;
  readonly reconcileIntake: (rawText: string) => Promise<string>;
  readonly runMatching: () => Promise<string>;
  readonly resolveMatch: (rowId: string, pageUrl: string) => Promise<string>;
  readonly discardName: (rowId: string) => Promise<string>;
  readonly setAnimeDays: (animeId: string, dias: readonly string[]) => Promise<string>;
  readonly sendToVerHoy: (animeIds: readonly string[]) => Promise<SendToVerHoyResult>;
  readonly triggerSeasonDownloads: () => Promise<string>;
  readonly setGrade: (animeId: string, grade: number) => Promise<string>;
  readonly skipGrading: (rowId: string) => Promise<string>;
  readonly setConsideration: (rowId: string, consideration: string) => Promise<string>;
  readonly confirmSelection: () => Promise<ConfirmSelectionResult>;
  readonly createSeasonAnimes: (rowIds: readonly string[], folders: Readonly<Record<string, string>>) => Promise<string>;
  readonly pickFolder: (title: string) => Promise<string>;
  readonly getOrderingBoard: () => Promise<OrderingBoard>;
  /**
   * Reads the ordering board stored when a closed season ended. Optional on the
   * port so pre-existing partial test doubles and degraded sources stay
   * assignable; the runtime adapter always provides it. A missing read is an
   * UNAVAILABLE read, never "this season recorded nothing" — the history surface
   * reports a failure rather than a historical claim it cannot make.
   */
  readonly getSeasonOrderingSnapshot?: (seasonId: string) => Promise<SeasonOrderingSnapshot>;
  readonly saveOrderingDraft: (draftJson: string) => Promise<string>;
  readonly applySchedule: () => Promise<ApplyScheduleResult>;
  readonly reopenOrdering: () => Promise<string>;
  readonly recheckAvailability: () => Promise<string>;
  readonly openPage: (url: string) => void;
}
