/**
 * Anime is the shared DTO exposed by the runtime for a single anime in the
 * local catalog. It includes both active and inactive animes.
 */
export interface Anime {
  readonly id: string;
  readonly name: string;
  readonly status: number;
  readonly episodesWatched: number;
  readonly totalEpisodes?: number;
  readonly active: number;
  readonly kind?: number;
  readonly days: readonly string[];
  readonly genres: readonly string[];
  /** True when the `sourceUrl` (download source page) field is present and non-empty. */
  readonly hasDownloadPage: boolean;
  /** True when the `folder` (download destination folder) field is present and non-empty. */
  readonly hasFolder: boolean;
}

/** A single repetition-history entry from the `repetitions` timeline. */
export interface AnimeRepeticion {
  readonly numRepetitions: number;
  readonly episodesWatched: number;
  readonly status: number;
  readonly createdAt?: number;
  readonly premieredAt?: number;
  readonly lastWatchedAt?: number;
  readonly deletedAt?: number;
  readonly repeatedAt?: number;
}

/** A single scheduled-day entry (`days`) on an anime detail record. */
export interface AnimeDetailDay {
  readonly day: string;
  readonly order: number;
}

/**
 * AnimeDetail is the rich, read-only detail DTO returned by `GetAnimeDetail`.
 * Shares only the scalar catalog fields with `Anime`. It deliberately does
 * not extend the full catalog DTO because `days`, download-page, and folder
 * data have richer detail-specific representations.
 *
 * `repetitions` is optional (not just empty-array) because the Go contract
 * omits it from the wire payload via `omitempty` even for a non-nil empty
 * slice (encoding/json's `omitempty` treats zero-length slices as empty) --
 * the vast majority of anime have no repetition history, so callers must
 * treat a missing `repetitions` the same as an empty timeline.
 */
export interface AnimeDetail extends Omit<
  Anime,
  'id' | 'days' | 'hasDownloadPage' | 'hasFolder'
> {
  readonly id: string;
  readonly firstCycle: number;
  readonly days: readonly AnimeDetailDay[];
  readonly lastWatchedAt?: number;
  readonly premieredAt?: number;
  readonly createdAt?: number;
  readonly deletedAt?: number;
  readonly cover?: string;
  readonly sourceUrl?: string;
  readonly folder?: string;
  readonly studios?: string;
  readonly origin?: string;
  readonly durationMinutes?: number;
  readonly repetitions?: readonly AnimeRepeticion[];
  readonly modified_at: number;
}

/**
 * AnimeHistoryEntry is a single row of the History read model returned by
 * `GetAnimeHistory` (Anime History spec, "History Read Model"): a
 * watch-activity log entry, server-sorted DESC by `lastWatchedAt` and
 * membership-filtered (only animes with a present `lastWatchedAt`) --
 * never re-derived or re-sorted on the frontend.
 */
export type AnimeHistoryEntry = Pick<
  Anime,
  'id' | 'name' | 'episodesWatched' | 'status' | 'kind'
> & {
  readonly lastWatchedAt: number;
  readonly createdAt?: number;
};

/** Fidelity marker for legacy `estudios` ownership on the editor wire contract. */
export type AnimeEditorStudiosKind = 'missing' | 'null' | 'empty' | 'values';

/** Full-fidelity legacy `portada` object preserved by the anime editor contract. */
export interface AnimeEditorCover {
  readonly type?: string;
  readonly path?: string;
  readonly raw?: Readonly<Record<string, unknown>>;
}

/** Structured `estudios` payload with explicit missing/null/empty/value ownership. */
export interface AnimeEditorStudios {
  readonly kind: AnimeEditorStudiosKind;
  readonly values: readonly string[];
}

/** Frequently edited fields that stay visible in the editor's primary pane. */
export interface AnimeEditorFrequentFields {
  readonly name: string;
  readonly status: number;
  readonly progress: number;
  readonly totalEpisodes?: number;
  readonly active: boolean;
  readonly kind?: number;
  readonly page?: string;
  readonly folder?: string;
  readonly placements: readonly AnimeSchedulePlacement[];
}

/** Secondary anime editor metadata grouped under the details section. */
export interface AnimeEditorDetailFields {
  readonly premieredAt?: number;
  readonly duration?: number;
  readonly origin?: string;
  readonly genres: readonly string[];
  readonly studios: AnimeEditorStudios;
  readonly cover?: AnimeEditorCover | null;
}

/** Authoritative editor record returned by the bridge runtime for one anime. */
export interface AnimeEditorRecord {
  readonly animeId: string;
  readonly modifiedAt: number;
  readonly frequent: AnimeEditorFrequentFields;
  readonly details: AnimeEditorDetailFields;
}

/** Explicit authoritative outcome returned by editor mutation runtime calls. */
export type AnimeEditorOutcome = 'applied' | 'no_op' | 'conflict' | 'error';

/** Explicit load result for one editor record. */
export interface AnimeEditorRecordResult {
  readonly outcome: AnimeEditorOutcome;
  readonly message: string;
  readonly details?: Readonly<Record<string, string>>;
  readonly record?: AnimeEditorRecord;
}

/** Explicit authoritative result returned by editor save/deactivate calls. */
export interface AnimeEditorSaveResult {
  readonly animeId?: string;
  readonly conflictId?: string;
  readonly message: string;
  readonly modifiedAt?: number;
  readonly outcome: AnimeEditorOutcome;
  readonly details?: Readonly<Record<string, string>>;
  readonly record?: AnimeEditorRecord;
}

/** One schedule board destination for anime ordering. */
export interface AnimeScheduleDestination {
  readonly id: string;
  readonly label: string;
  readonly kind: 'weekday' | 'special';
}

/** One active anime entry on the editor's global schedule board. */
export interface AnimeEditorScheduleBoardEntry {
  readonly animeId: string;
  readonly name: string;
  readonly active: boolean;
  readonly modifiedAt: number;
  readonly placements: readonly AnimeSchedulePlacement[];
  readonly status: number;
  readonly progress: number;
  readonly cover?: string;
  readonly originHighlighted: boolean;
}

/** Global active-anime schedule board loaded by the editor modal. */
export interface AnimeEditorScheduleBoard {
  readonly originAnimeId: string;
  readonly boardModifiedAt: number;
  readonly destinations: readonly AnimeScheduleDestination[];
  readonly entries: readonly AnimeEditorScheduleBoardEntry[];
}

/** Explicit result for loading the global editor schedule board. */
export interface AnimeEditorScheduleBoardResult {
  readonly outcome: AnimeEditorOutcome;
  readonly message: string;
  readonly details?: Readonly<Record<string, string>>;
  readonly board?: AnimeEditorScheduleBoard;
}

/** Explicit result for applying the whole editor schedule draft. */
export interface AnimeEditorScheduleApplyResult {
  readonly outcome: AnimeEditorOutcome;
  readonly message: string;
  readonly modifiedAt?: number;
  readonly conflictId?: string;
  readonly details?: Readonly<Record<string, string>>;
  readonly board?: AnimeEditorScheduleBoard;
}

/** Tri-state string patch used by the editor save command. */
export interface AnimeEditorNullableStringPatch {
  readonly present: boolean;
  readonly clear: boolean;
  readonly value: string;
}

/** Structured cover patch preserving unknown legacy cover metadata. */
export interface AnimeEditorCoverPatch {
  readonly present: boolean;
  readonly clear: boolean;
  readonly type: string;
  readonly path: string;
  readonly raw?: Readonly<Record<string, unknown>>;
}

/** Frontend write-side patch for one anime editor save operation. */
export interface AnimeEditorPatch {
  readonly name?: string;
  readonly status?: number;
  readonly progress?: number;
  readonly totalEpisodes?: AnimeEditorNullableStringPatch;
  readonly page: AnimeEditorNullableStringPatch;
  readonly folder: AnimeEditorNullableStringPatch;
  readonly origin: AnimeEditorNullableStringPatch;
  readonly duration: AnimeEditorNullableStringPatch;
  readonly kind: AnimeEditorNullableStringPatch;
  readonly premieredAt: AnimeEditorNullableStringPatch;
  readonly placements?: readonly AnimeSchedulePlacement[];
  readonly genres?: readonly string[];
  readonly studios?: readonly string[];
  readonly cover: AnimeEditorCoverPatch;
  readonly active?: boolean;
}

/** Command sent by the frontend to save one anime editor record. */
export interface SaveAnimeEditorCommand {
  readonly animeId: string;
  readonly baseModifiedAt: number;
  readonly patch: AnimeEditorPatch;
}

/** One changed-anime schedule entry within a whole-draft apply command. */
export interface ApplyAnimeScheduleDraftEntry {
  readonly animeId: string;
  readonly baseModifiedAt: number;
  readonly placements: readonly AnimeSchedulePlacement[];
}

/** English frontend representation of a legacy schedule placement. */
export interface AnimeSchedulePlacement {
  readonly day: string;
  readonly order: number;
}

/** Whole-draft schedule apply command for the anime editor modal. */
export interface ApplyAnimeScheduleDraftCommand {
  readonly boardModifiedAt: number;
  readonly entries: readonly ApplyAnimeScheduleDraftEntry[];
}
