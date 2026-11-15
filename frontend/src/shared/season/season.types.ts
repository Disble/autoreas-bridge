import type { SeasonQuerySource, SeasonSource } from '../contracts/season.types';
import type { SeasonStoreState } from '../store/season-store/season-store.types';

/** What the season reads and the season lifecycle commands go through: the runtime adapter, or a test double. */
export type SeasonDataSource = SeasonQuerySource & Pick<SeasonSource, 'createSeason' | 'closeSeason'>;

/**
 * When a season read fetches: `mount` on every mount while stale and on every
 * invalidation, `once` only while nothing is cached (once per session), `never`
 * (the cache only; a Today-side reader never fetches the season).
 */
export type SeasonQueryRefresh = 'mount' | 'once' | 'never';

/** One season read: its key, its fetcher, and how long its data stays fresh. */
export interface SeasonRead<TData> {
  /** The read's query key. */
  readonly queryKey: readonly unknown[];
  /** The source call. */
  readonly queryFn: () => Promise<TData>;
  /** How long a loaded answer stays fresh, in ms. */
  readonly staleTime: number;
}

/** The part of a query a `once` predicate reads. */
export interface SeasonQueryState {
  /** The query's cache entry state. */
  readonly state: { readonly data: unknown };
}

/** The `enabled` option a season read passes to `useBridgeQuery`. */
export type SeasonQueryEnabled = boolean | ((query: SeasonQueryState) => boolean);

/** Options of the displayed-season reads. */
export interface DisplayedSeasonOptions {
  /** When the displayed read fetches. */
  readonly refresh: SeasonQueryRefresh;
  /** The port the reads go through; the runtime adapter by default. */
  readonly source?: SeasonQuerySource;
}

/**
 * How a read outcome reaches the shared season banner: `fallback` names a
 * failure without a message, `fixedMessage` replaces every failure's message,
 * and `clearOnSuccess` clears the banner when a new read succeeds.
 */
export interface SeasonBannerPolicy {
  /** The banner text for a failure that carries no message. */
  readonly fallback: string;
  /** Whether every failure shows `fallback`, whatever its message. */
  readonly fixedMessage: boolean;
  /** Whether a successful new read clears the banner. */
  readonly clearOnSuccess: boolean;
}

/** The part of a query result the banner sync reads. */
export interface SeasonBannerSource {
  /** When the query last succeeded; 0 before its first success. */
  readonly dataUpdatedAt: number;
  /** When the query last failed; 0 before its first failure. */
  readonly errorUpdatedAt: number;
  /** The last failure. */
  readonly error: unknown;
}

/** The two reads of a past season, as the past-season view waits on them. */
export interface PastSeasonReads {
  /** The past season's read. */
  readonly season: SeasonPendingRead<SeasonStoreState['season']>;
  /** The past season's intake rows read. */
  readonly animes: SeasonPendingRead<SeasonStoreState['seasonAnimes']>;
}

/** The part of a query result the past-season view reads. */
export interface SeasonPendingRead<TData> {
  /** The query status. */
  readonly status: 'pending' | 'error' | 'success';
  /** The loaded data. */
  readonly data: TData | undefined;
  /** The last failure. */
  readonly error: unknown;
  /** Whether `data` belongs to the previous key. */
  readonly isPlaceholderData: boolean;
}

/** What the past-season view does next: keep waiting, show the season, or report the failure. */
export type PastSeasonLoadOutcome =
  | { readonly kind: 'waiting' }
  | { readonly kind: 'ready'; readonly state: Partial<SeasonStoreState> }
  | { readonly kind: 'failed'; readonly errorMessage: string };

/** The season lifecycle commands the workspace and the ordering board run. */
export interface SeasonLifecycleCommands {
  /** Opens a new season, then reads the season again. */
  readonly createSeason: (name: string) => Promise<void>;
  /** Closes the open season, then reads the season again. */
  readonly closeSeason: () => Promise<void>;
}

/** Entering and leaving the read-only view of a past season. */
export interface PastSeasonView {
  /** Loads a past season and its rows, and shows them once both loaded. */
  readonly viewPastSeason: (seasonId: string) => void;
  /** Returns to the live season and reads it again. */
  readonly exitPastSeason: () => Promise<void>;
}
