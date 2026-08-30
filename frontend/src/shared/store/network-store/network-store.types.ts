import type { ObservabilityLogEntry } from '../../contracts/observability.types';

/** Status-based filter applied to the folded Network request rows. */
export type NetworkStatusFilter = 'all' | 'success' | 'error' | 'pending';

/**
 * RuntimeEventRow is one row of the Runtime Events feed, whatever its origin:
 * a persisted row read through `SearchRuntimeEvents`, or a live push that the
 * store admitted onto the overlay before the asynchronous INSERT assigned it a
 * database id. `id` is therefore a string, not the persisted surrogate — the
 * live push has no persisted id by design, so nothing may key on one.
 */
export interface RuntimeEventRow {
  readonly id: string;
  readonly occurredAtMs: number;
  readonly domain: string;
  readonly level: string;
  readonly message: string;
  readonly correlationId?: string;
  readonly entityId?: string;
  readonly eventType?: string;
  readonly durationMs?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** One selectable domain-filter option, derived from the summary aggregate. */
export interface NetworkDomainOption {
  readonly value: string;
  readonly label: string;
}

/** How a freshly-fetched runtime-event page is merged into the feed. */
export type EventPageMode = 'replace' | 'append';

/**
 * EventFeedState is the persisted-page + live-overlay read model behind the
 * Runtime Events rail. `page` walks strictly backwards in time by keyset
 * cursor and `overlay` only ever grows at the head, so the two never collide
 * and no page boundary shifts (design D-3).
 *
 * There is deliberately no entry cap here: `MAX_LOG_ENTRIES`/`keepRecent` cap
 * the legacy in-memory buffer, and applying either to a cursor-paged feed
 * would delete rows the user just paged in (design D-6.2).
 */
export interface EventFeedState {
  /** Persisted rows, newest-first, growing at the tail as cursor pages load. */
  readonly page: readonly RuntimeEventRow[];
  /** Live pushes admitted since the first page loaded, newest-first. */
  readonly overlay: readonly RuntimeEventRow[];
  /** Keyset continuation for the next older page; null once pagination is exhausted. */
  readonly nextCursor: string | null;
  /** `occurredAtMs` of the newest persisted row, the overlay's admission boundary. */
  readonly head: number | null;
  readonly isLoadingMore: boolean;
  /** False when this database has no persisted runtime-event table at all. */
  readonly available: boolean;
  readonly domainOptions: readonly NetworkDomainOption[];
}

/** Level-based filter applied to the per-entry Network rows. */
export type NetworkLevelFilter = 'all' | 'info' | 'debug' | 'warn' | 'error';

/**
 * NetworkRequestRow is a single Network-tab row produced by `foldByCorrelationId`.
 * Each log entry without a `correlationId` becomes its own row (stable per-entry
 * identity); entries sharing a non-empty `correlationId` fold into one row
 * (dedup, last-write-wins per field, ordered by `startedAt`).
 */
export interface NetworkRequestRow {
  /** Dedup/group key: the entry's own correlationId, or its stable per-entry identity when absent. */
  readonly correlationId: string;
  readonly method: string;
  readonly path: string;
  /** Last-write-wins; null until a status-bearing event arrives. */
  readonly status: number | null;
  /** Last-write-wins; null until a duration-bearing event arrives. */
  readonly durationMs: number | null;
  readonly domain: string;
  /** First event timestamp for this row (order anchor). */
  readonly startedAt: string;
  /** Last event timestamp for this row. */
  readonly updatedAt: string;
  /** Backing events for the detail panel, oldest first. */
  readonly events: readonly ObservabilityLogEntry[];
}

/** Mutable accumulator used while folding raw log entries into request rows. */
export interface MutableRowAccumulator {
  readonly groupKey: string;
  method: string;
  path: string;
  status: number | null;
  durationMs: number | null;
  domain: string;
  startedAt: string;
  updatedAt: string;
  events: ObservabilityLogEntry[];
}

/** Raw entry paired with its stable per-entry identity for Network selection. */
export interface EntryWithId {
  readonly id: string;
  readonly entry: ObservabilityLogEntry;
}

/**
 * NetworkStoreState is the Zustand read-model for the Network tab. It holds
 * two feeds during the repoint: the legacy append+cap `buffer` still consumed
 * by the shipped rail, and the persisted-page + live-overlay `EventFeedState`
 * the rail moves onto. The fold into `NetworkRequestRow[]` happens on read via
 * pure selectors in `network-store.helpers.ts`, never inside the store itself.
 */
export interface NetworkStoreState extends EventFeedState {
  readonly buffer: readonly ObservabilityLogEntry[];
  readonly selectedId: string | null;
  readonly query: string;
  readonly statusFilter: NetworkStatusFilter;
  readonly levelFilter: NetworkLevelFilter;
  readonly domainFilter: string;
  readonly ingest: (entry: ObservabilityLogEntry) => void;
  readonly seed: (entries: readonly ObservabilityLogEntry[]) => void;
  readonly select: (id: string | null) => void;
  readonly setQuery: (query: string) => void;
  readonly setStatusFilter: (filter: NetworkStatusFilter) => void;
  readonly setLevelFilter: (filter: NetworkLevelFilter) => void;
  readonly setDomainFilter: (filter: string) => void;
  /**
   * Merges one fetched page into the feed. `replace` starts a fresh query: it
   * discards the previous page, drops the overlay whose admission boundary no
   * longer applies, and re-anchors `head` on the newest incoming row.
   * `append` concatenates an older cursor page at the tail and leaves both the
   * overlay and `head` untouched, which is what keeps the cursor valid.
   */
  readonly setPage: (items: readonly RuntimeEventRow[], nextCursor: string | null, mode: EventPageMode) => void;
  /** Adds one admitted live push at the head of the overlay. */
  readonly prependOverlay: (row: RuntimeEventRow) => void;
  readonly setLoadingMore: (isLoadingMore: boolean) => void;
  readonly setAvailable: (available: boolean) => void;
  readonly setDomainOptions: (options: readonly NetworkDomainOption[]) => void;
}
