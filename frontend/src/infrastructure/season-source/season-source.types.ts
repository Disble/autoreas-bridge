/**
 * Frontend-facing shape of the active season snapshot.
 */
export interface SeasonSnapshot {
  readonly id: string;
  readonly name: string;
  readonly minApprovalGrade: number;
  readonly slots: number;
  readonly status: string;
  /** Confirmation time in epoch ms; Wails sends the nullable Go `*int64` as `null` when never confirmed. */
  readonly selectionConfirmedAt?: number | null;
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
  /**
   * The MyAnimeList lookup this row's user confirmed, as stored with the row.
   * Absent means the row never had one (or its stored payload was unreadable), so
   * consumers can tell "no record" apart from an empty one. Its fields are the
   * canonical anime create vocabulary, the same shape {@link SeasonCreateMetadata}
   * sends when the row is created.
   */
  readonly metadata?: SeasonCreateMetadata;
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
  /**
   * The Daily board stored with the same closure payload. Absent when the read
   * degraded before reaching Go; `recorded` is false when the season closed
   * before the Daily board was captured.
   */
  readonly dailyBoard?: SeasonDailyBoardSnapshot;
}

/** One created season anime on the Daily board when its season closed. */
export interface SeasonDailyBoardEntry {
  /** The season row id the entry belongs to. */
  readonly rowId: string;
  /** The created anime's id. */
  readonly animeId: string;
  /** Its daily section: "Sin ver", "Ver hoy" or "Visto" (Spanish data literals). */
  readonly section: string;
  /** Its 1-based order within that section. */
  readonly order: number;
}

/** The Daily board a closed season stored, and whether one was recorded. */
export interface SeasonDailyBoardSnapshot {
  /** False when the season closed before the Daily board was captured. */
  readonly recorded: boolean;
  /** The recorded entries, empty when not recorded. */
  readonly entries: readonly SeasonDailyBoardEntry[];
}

/**
 * The canonical typed anime cover (`type` + `path`) the anime create contract
 * uses. A confirmed lookup only has a URL, so a season row carries its cover
 * with type `'url'` rather than a bare string.
 */
export interface SeasonCreateCover {
  readonly type: string;
  readonly path: string;
}

/**
 * The metadata one intake row may carry into the anime it creates, in the shape
 * the Go side accepts: numbers are numbers, lists are lists, the cover is the
 * canonical typed shape, and every member is optional so a field the user never
 * confirmed is simply absent. The names mirror the canonical anime create
 * vocabulary in `internal/season/ports.go`.
 *
 * Wails does not register a `map[string]Struct` value type in its generated
 * models, so this type is declared here rather than imported from
 * `frontend/wailsjs`.
 *
 * There is deliberately no title member: the anime's name is its identity, not
 * metadata. The intake row's raw name is what the anime is created with, so a
 * confirmed MyAnimeList title must never rename it.
 */
export interface SeasonCreateMetadata {
  /** Canonical content type (0 = Anime (TV), 1 = Película, 2 = Especial, 3 = OVA). */
  readonly kind?: number;
  readonly totalEpisodes?: number;
  readonly durationMinutes?: number;
  readonly origin?: string;
  readonly genres?: readonly string[];
  readonly studios?: readonly string[];
  readonly cover?: SeasonCreateCover;
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

/**
 * One matching phase the run names on every progress event
 * (`internal/events/event.go`: the run is one run with two phases, so the
 * panel never claims to be matching while it is really checking episodes).
 */
export type SeasonMatchingPhase = 'name_matching' | 'availability_check';

/**
 * Run total carried by the `season.matching_started` runtime event: how many
 * rows this run will attempt. It carries no per-state counters -- the panel
 * derives those from the rows it already holds.
 */
export interface SeasonMatchingStartedNotice {
  readonly seasonId: string;
  readonly total: number;
}

/** One retained candidate carried by a matching progress event. */
export interface SeasonMatchingProgressCandidate {
  readonly title: string;
  readonly pageUrl: string;
  readonly score: number;
}

/**
 * One resolved row carried by the `season.matching_progress` runtime event,
 * in the phase the row just resolved in -- including rows whose search
 * failed. It carries the row and no per-state counters.
 */
export interface SeasonMatchingProgressNotice {
  readonly seasonId: string;
  readonly phase: SeasonMatchingPhase;
  readonly rowId: string;
  readonly rawName: string;
  readonly matchStatus: string;
  readonly matchedSlug: string;
  readonly candidates: readonly SeasonMatchingProgressCandidate[];
  readonly availability: string;
  readonly availableEpisodes: number;
}

/**
 * Terminal signal carried by the `season.matching_finished` runtime event,
 * published once after both phases have completed. It carries no counters
 * and no history: the season's own rows are the record.
 */
export interface SeasonMatchingFinishedNotice {
  readonly seasonId: string;
}

/**
 * Wire shape of the `season.matching_started` payload as the desktop bridge
 * forwards it: the raw Go event struct, which carries no `json` tags, so its
 * field names arrive capitalized.
 */
export interface SeasonMatchingStartedWire {
  readonly SeasonID: string;
  readonly Total: number;
}

/** One retained candidate in the wire progress payload, with Go field names. */
export interface SeasonMatchingCandidateWire {
  readonly Title: string;
  readonly PageURL: string;
  readonly Score: number;
}

/**
 * Wire shape of the `season.matching_progress` payload as the desktop bridge
 * forwards it: the raw Go event struct with capitalized field names, and a
 * null candidate list when the row retained none (Go nil slice).
 */
export interface SeasonMatchingProgressWire {
  readonly SeasonID: string;
  readonly Phase: string;
  readonly RowID: string;
  readonly RawName: string;
  readonly MatchStatus: string;
  readonly MatchedSlug: string;
  readonly Candidates: readonly SeasonMatchingCandidateWire[] | null;
  readonly Availability: string;
  readonly AvailableEpisodes: number;
}

/**
 * Wire shape of the `season.matching_finished` payload as the desktop bridge
 * forwards it: the raw Go event struct with capitalized field names.
 */
export interface SeasonMatchingFinishedWire {
  readonly SeasonID: string;
}

/**
 * One download-provider page a free-text provider search returned: a match
 * candidate's title and page URL, unscored, plus the provider's own name
 * (e.g. `jkanime`) and the cover it showed (empty or absent when none).
 */
export type SeasonProviderPage = Omit<SeasonAnimeCandidate, 'score'> & Readonly<{ provider: string; imageUrl?: string }>;

/**
 * Result of searching every download provider by free text. `status` is `ok`
 * or the failure's message; `pages` is empty, never null, when nothing matched.
 */
export interface SeasonProviderSearchResult {
  readonly status: string;
  readonly pages: readonly SeasonProviderPage[];
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
  /**
   * Searches every download provider by free text, for the intake's "Find on
   * provider" lookup. Optional on the port, like `getSeasonOrderingSnapshot`,
   * so pre-existing partial test doubles stay assignable; the runtime adapter
   * always provides it, and a missing search reads as unavailable, never as
   * "no pages".
   */
  readonly searchProviders?: (query: string) => Promise<SeasonProviderSearchResult>;
  /** Marks an intake row discarded; "ok" or an error message. */
  readonly discardName: (rowId: string) => Promise<string>;
  /** Brings a discarded intake row back with its matched page; "ok" or an error message. */
  readonly restoreName: (rowId: string) => Promise<string>;
  readonly setAnimeDays: (animeId: string, dias: readonly string[]) => Promise<string>;
  readonly sendToVerHoy: (animeIds: readonly string[]) => Promise<SendToVerHoyResult>;
  readonly triggerSeasonDownloads: () => Promise<string>;
  /** Downloads only the given Ver hoy animes as one run; "ok" once it started, or why it could not. */
  readonly downloadSeasonAnimes: (animeIds: readonly string[]) => Promise<string>;
  readonly setGrade: (animeId: string, grade: number) => Promise<string>;
  readonly skipGrading: (rowId: string) => Promise<string>;
  readonly setConsideration: (rowId: string, consideration: string) => Promise<string>;
  readonly confirmSelection: () => Promise<ConfirmSelectionResult>;
  readonly createSeasonAnimes: (
    rowIds: readonly string[],
    folders: Readonly<Record<string, string>>,
    metadata: Readonly<Record<string, SeasonCreateMetadata>>,
  ) => Promise<string>;
  /**
   * Stores one row's confirmed MyAnimeList metadata, or clears it when the
   * payload is empty. Required rather than optional: a source that cannot write
   * would leave the panel claiming a choice it never persisted, and every
   * implementation (the runtime adapter and the test doubles) must say what it
   * does here.
   */
  readonly setSeasonAnimeMetadata: (rowId: string, metadataJSON: string) => Promise<string>;
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
  /** Reads the local HH:MM of the daily availability check; `''` when the runtime is unavailable. */
  readonly getCheckTime: () => Promise<string>;
  /** Saves the local HH:MM of the daily availability check; resolves `'ok'` or the failure message. */
  readonly setCheckTime: (hhmm: string) => Promise<string>;
  readonly openPage: (url: string) => void;
  /**
   * Fires when a matching run opens, carrying the run total. Optional on the
   * port so pre-existing partial test doubles and degraded sources stay
   * assignable -- like `getSeasonOrderingSnapshot` above -- the runtime
   * adapter always provides it. A missing subscription is a silent run, never
   * a broken command: the rows still reload when the command returns `ok`.
   */
  readonly subscribeMatchingStarted?: (listener: (notice: SeasonMatchingStartedNotice) => void) => () => void;
  /**
   * Fires once per attempted row, in the phase the row just resolved in.
   * Optional for the same reason as `subscribeMatchingStarted`: without it
   * the rows update only when the command returns.
   */
  readonly subscribeMatchingProgress?: (listener: (notice: SeasonMatchingProgressNotice) => void) => () => void;
  /**
   * Fires once when a matching run reaches its terminal signal, after both
   * phases have completed. Optional for the same reason as
   * `subscribeMatchingStarted`. An infrastructure abort emits no finished
   * event, so the panel also leaves its progress state when the command
   * returns something other than `ok`.
   */
  readonly subscribeMatchingFinished?: (listener: (notice: SeasonMatchingFinishedNotice) => void) => () => void;
}
