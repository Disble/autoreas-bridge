import type { ObservabilityLogEntry } from '../contracts/observability.types';

/** Status-based filter applied to the folded Network request rows. */
export type NetworkStatusFilter = 'all' | 'success' | 'error' | 'pending';

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

/**
 * NetworkStoreState is the Zustand read-model for the Network tab: an
 * append+cap raw event buffer (source of truth) plus selection/filter state.
 * The fold into `NetworkRequestRow[]` happens on read via pure selectors in
 * `network-store.helpers.ts`, never inside the store itself.
 */
export interface NetworkStoreState {
  readonly buffer: readonly ObservabilityLogEntry[];
  readonly selectedId: string | null;
  readonly query: string;
  readonly statusFilter: NetworkStatusFilter;
  readonly ingest: (entry: ObservabilityLogEntry) => void;
  readonly seed: (entries: readonly ObservabilityLogEntry[]) => void;
  readonly select: (id: string | null) => void;
  readonly setQuery: (query: string) => void;
  readonly setStatusFilter: (filter: NetworkStatusFilter) => void;
}
