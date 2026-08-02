import type { TransactionStoreFilters } from './transaction-store.types';

/**
 * How long a transport-only arrival row may stay pending before the UI stops
 * treating it as in flight.
 *
 * A capture row is written twice under one requestId: a pending arrival before
 * the handler runs, then a terminal row. A process that dies between the two
 * leaves the arrival stranded as pending forever. The bridge sweeps those at
 * startup, but a row can also strand mid-session (its terminal write dropped
 * from the capture queue and the SQLite fallback failed too), and nothing will
 * revisit it until the next launch. Past this window the UI stops the elapsed
 * ticker and labels the row abandoned instead of counting up indefinitely.
 *
 * Five minutes is far above any real bridge request — the slowest observed
 * captures are tens of seconds — while staying short enough that a stranded row
 * settles within one sitting.
 */
export const TRANSACTION_STALE_PENDING_THRESHOLD_MS = 5 * 60 * 1000;

/** The TransactionPanel's initial (no-op) filter set. */
export const DEFAULT_TRANSACTION_FILTERS: TransactionStoreFilters = {
  route: '',
  outcome: '',
  kind: '',
  statusClass: 'all',
  query: '',
};
