import { createStore } from 'zustand/vanilla';
import type { CaptureQueryFilters, CaptureRow } from '../../contracts/capture.types';
import { DEFAULT_TRANSACTION_FILTERS } from './transaction-store.constants';
import type {
  TransactionPageMode,
  TransactionStatusClassFilter,
  TransactionStoreFilters,
  TransactionStoreState,
} from './transaction-store.types';

/**
 * Merges a freshly-fetched page of rows into the existing buffer: `replace`
 * (a fresh filter/query, e.g. from the first page) discards the previous
 * buffer; `append` (pagination "load more") concatenates newest rows after
 * the existing ones.
 */
export function mergeTransactionPage(
  existing: readonly CaptureRow[],
  incoming: readonly CaptureRow[],
  mode: TransactionPageMode,
): readonly CaptureRow[] {
  return mode === 'append' ? [...existing, ...incoming] : incoming;
}

/**
 * Reports whether a row's `httpStatus` falls in the given status-class
 * bucket ('all' always matches; a row with no `httpStatus` matches only 'all').
 */
export function matchesStatusClass(row: Readonly<CaptureRow>, statusClass: TransactionStatusClassFilter): boolean {
  if (statusClass === 'all') {
    return true;
  }

  if (row.httpStatus === undefined) {
    return false;
  }

  const bucket = Math.floor(row.httpStatus / 100);

  return `${bucket}xx` === statusClass;
}

/**
 * Reports whether a row matches the free-text query against its route,
 * kind, outcome, and error code (case-insensitive substring match). An
 * empty query always matches.
 */
export function matchesTransactionQuery(row: Readonly<CaptureRow>, query: string): boolean {
  if (query === '') {
    return true;
  }

  const normalizedQuery = query.toLowerCase();

  return (
    row.route.toLowerCase().includes(normalizedQuery) ||
    row.kind.toLowerCase().includes(normalizedQuery) ||
    row.outcome.toLowerCase().includes(normalizedQuery) ||
    (row.errorCode ?? '').toLowerCase().includes(normalizedQuery)
  );
}

/**
 * Merges a batch of pushed rows (from the `capture.transaction` runtime
 * event) into the existing buffer, keyed by `requestId`: an unseen row is
 * prepended (newest-first, DevTools-Network order); a row that already
 * exists (e.g. an arrival row later completing) is updated in place at its
 * current position instead of moving, so neither the caller's selection nor
 * its scroll position shift. Never creates a duplicate row for the same
 * `requestId`.
 */
export function upsertTransactionRows(
  existing: readonly CaptureRow[],
  incoming: readonly CaptureRow[],
): readonly CaptureRow[] {
  let next = existing;

  for (const row of incoming) {
    const index = next.findIndex((item) => item.requestId === row.requestId);
    next = index === -1 ? [row, ...next] : next.map((item, itemIndex) => (itemIndex === index ? row : item));
  }

  return next;
}

/** Reports whether any row in the buffer is still in its pending (in-flight) state. */
export function selectHasPendingTransactions(items: readonly CaptureRow[]): boolean {
  return items.some((item) => item.outcome === 'pending');
}

/**
 * Filters the current page buffer by the client-only concerns
 * (`statusClass`, free-text `query`) not already narrowed server-side.
 */
export function selectVisibleTransactionRows(
  items: readonly CaptureRow[],
  filters: Readonly<TransactionStoreFilters>,
): readonly CaptureRow[] {
  return items.filter((row) => matchesStatusClass(row, filters.statusClass) && matchesTransactionQuery(row, filters.query));
}

/**
 * Maps the store's server-relevant filters (route/outcome/kind) plus a
 * pagination cursor/limit into the backend query shape the infrastructure
 * source accepts. `statusClass`/`query` stay client-only and are never sent.
 */
export function toBackendCaptureFilters(
  filters: Readonly<TransactionStoreFilters>,
  cursor: string | null,
  limit: number,
): CaptureQueryFilters {
  return {
    limit,
    cursor: cursor ?? undefined,
    route: filters.route === '' ? undefined : filters.route,
    outcome: filters.outcome === '' ? undefined : filters.outcome,
    kind: filters.kind === '' ? undefined : filters.kind,
  };
}

/** Vanilla backing store for the shared transaction (Activity/Network) read-model. */
export const transactionStore = createStore<TransactionStoreState>()((set) => ({
  items: [],
  nextCursor: null,
  selectedId: null,
  selectedDetail: null,
  filters: DEFAULT_TRANSACTION_FILTERS,
  degraded: false,
  isLoading: true,
  setPage: (items, nextCursor, mode) =>
    set((state) => ({
      items: mergeTransactionPage(state.items, items, mode),
      nextCursor,
    })),
  upsertRows: (rows) => set((state) => ({ items: upsertTransactionRows(state.items, rows) })),
  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
  select: (id) => set({ selectedId: id, selectedDetail: null }),
  setSelectedDetail: (detail) => set({ selectedDetail: detail }),
  setDegraded: (degraded) => set({ degraded }),
  setLoading: (isLoading) => set({ isLoading }),
  reset: () =>
    set({
      items: [],
      nextCursor: null,
      selectedId: null,
      selectedDetail: null,
      filters: DEFAULT_TRANSACTION_FILTERS,
      degraded: false,
      isLoading: true,
    }),
}));

/** Reads the current transaction store snapshot outside React render. */
export function getTransactionStoreState(): TransactionStoreState {
  return transactionStore.getState();
}

/** Resets the transaction store to its initial state; used between tests. */
export function resetTransactionStore(): void {
  getTransactionStoreState().reset();
}
