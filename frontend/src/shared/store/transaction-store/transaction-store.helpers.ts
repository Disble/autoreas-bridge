import { createStore } from 'zustand/vanilla';
import type { CaptureQueryFilters, CaptureRow } from '../../contracts/capture.types';
import { DEFAULT_TRANSACTION_FILTERS, TRANSACTION_STALE_PENDING_THRESHOLD_MS } from './transaction-store.constants';
import type { TransactionPageMode, TransactionStoreFilters, TransactionStoreState } from './transaction-store.types';

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

/**
 * Reports whether a pending row has aged past
 * `TRANSACTION_STALE_PENDING_THRESHOLD_MS` — i.e. its terminal write is never
 * coming and it must stop being presented as in flight.
 */
export function isStalePendingCapture(capturedAtMs: number, now: number): boolean {
  return now - capturedAtMs >= TRANSACTION_STALE_PENDING_THRESHOLD_MS;
}

/**
 * Reports whether any row in the buffer is still genuinely in flight, which is
 * what gates the shared elapsed clock. A stranded arrival row does NOT count:
 * without this the clock would tick forever for a request that can never
 * complete, re-rendering the whole table every second for nothing.
 */
export function selectHasPendingTransactions(items: readonly CaptureRow[], now: number = Date.now()): boolean {
  return items.some((item) => item.outcome === 'pending' && !isStalePendingCapture(item.capturedAtMs, now));
}

/** Maps an unset (`''`) text filter to `undefined` so it is omitted from the query. */
function omitBlank(value: string): string | undefined {
  return value === '' ? undefined : value;
}

/** Reports whether a text filter is set, mirroring `omitBlank`'s unset convention. */
function isSet(value: string): boolean {
  return value !== '';
}

/**
 * Case-insensitive substring test against one row field. A `%` in the filter
 * value is a literal character here by construction, matching the server-side
 * rule the Go core implements: it escapes `%`, `_` and the escape character
 * inside its `LIKE '%value%'` pattern, so a typed `%` never widens the match.
 */
function containsIgnoreCase(value: string, fragment: string): boolean {
  return value.toLowerCase().includes(fragment.toLowerCase());
}

/**
 * Reports whether the pushed row is INADMISSIBLE while a device-scoped or
 * changelog-scoped filter is active: the row cannot vouch for either
 * predicate, so it must not be shown as if it passed the filter.
 */
function isRowInadmissible(filters: Readonly<TransactionStoreFilters>): boolean {
  return isSet(filters.deviceId) || filters.changelogId !== null;
}

/**
 * Unset-or-substring predicate for one case-insensitive text field (`route`,
 * `outcome`, `kind`): an unset (`''`) filter applies no predicate, a set one
 * matches as a substring with literal `%`.
 */
function textFilterMatches(rowValue: string, filterValue: string): boolean {
  return !isSet(filterValue) || containsIgnoreCase(rowValue, filterValue);
}

/**
 * Unset-or-exact predicate for one text field (`animeId`, `errorCode`): an
 * unset (`''`) filter applies no predicate, a set one must equal the row value.
 */
function exactTextFilterMatches(rowValue: string | undefined, filterValue: string): boolean {
  return !isSet(filterValue) || rowValue === filterValue;
}

/**
 * Unset-or-exact predicate for the numeric status: an unset (`null`) filter
 * applies no predicate, and an absent row status can never equal a chosen one.
 */
function httpStatusFilterMatches(rowStatus: number | undefined, filterStatus: number | null): boolean {
  return filterStatus === null || rowStatus === filterStatus;
}

/**
 * Time-bounds predicate for `startMs`/`endMs`, both inclusive and each
 * independently optional: an unset (`null`) bound applies no predicate.
 */
function capturedWithinBounds(capturedAtMs: number, startMs: number | null, endMs: number | null): boolean {
  return (startMs === null || capturedAtMs >= startMs) && (endMs === null || capturedAtMs <= endMs);
}

/**
 * Text group of the filter rule: the three free-text fields match as
 * case-insensitive substrings when set.
 */
function matchesTextFilters(row: Readonly<CaptureRow>, filters: Readonly<TransactionStoreFilters>): boolean {
  return textFilterMatches(row.route, filters.route) && textFilterMatches(row.outcome, filters.outcome) && textFilterMatches(row.kind, filters.kind);
}

/**
 * Exact group of the filter rule: `animeId`, `errorCode` and `httpStatus`
 * must equal the chosen values when those are set.
 */
function matchesExactFilters(row: Readonly<CaptureRow>, filters: Readonly<TransactionStoreFilters>): boolean {
  return (
    exactTextFilterMatches(row.animeId, filters.animeId) &&
    exactTextFilterMatches(row.errorCode, filters.errorCode) &&
    httpStatusFilterMatches(row.httpStatus, filters.httpStatus)
  );
}

/**
 * Bounds group of the filter rule: the capture time must fall inside the
 * inclusive `startMs`/`endMs` window when its bounds are set.
 */
function matchesBoundsFilters(row: Readonly<CaptureRow>, filters: Readonly<TransactionStoreFilters>): boolean {
  return capturedWithinBounds(row.capturedAtMs, filters.startMs, filters.endMs);
}

/**
 * Reports whether one pushed capture row satisfies the store's active filter
 * set. This predicate and {@link toBackendCaptureFilters} are the two halves
 * of ONE rule and must be changed together: the backend evaluates it over the
 * whole capture table when listing pages, and the live push path evaluates the
 * same predicate against a row the wire just handed it before admitting it
 * into the buffer. Mirrors the Go core's semantics: unset filters apply no
 * predicate, text filters are case-insensitive substring matches with literal
 * `%`, and `httpStatus` is exact equality (a row with no status can never
 * equal a chosen status).
 *
 * `deviceId` and `changelogId` make every row INADMISSIBLE while set: the
 * pushed `CaptureRow` carries no device id, and changelog ids live in the
 * correlations envelope the push does not carry, so the row cannot vouch for
 * either predicate. Showing a row the filter cannot vouch for is worse than
 * not showing it — and the row is not lost, it appears when the rail next
 * queries the backend.
 */
export function matchesTransactionFilters(row: Readonly<CaptureRow>, filters: Readonly<TransactionStoreFilters>): boolean {
  return !isRowInadmissible(filters) && matchesTextFilters(row, filters) && matchesExactFilters(row, filters) && matchesBoundsFilters(row, filters);
}

/**
 * Maps the store's filters plus a pagination cursor/limit into the backend
 * query shape the infrastructure source accepts. The backend evaluates the
 * rule described beside {@link matchesTransactionFilters} over the whole
 * capture table; this function is only its wire projection.
 *
 * Every filter goes to the backend, which is the whole point: the previous
 * shape narrowed the status class and the free text over the already-loaded
 * page, so a match one page further down was unreachable however far the user
 * paged. Unset fields are omitted rather than sent as zero values -- `?? undefined`
 * rather than `|| undefined`, so a changelog id of 0 and an epoch bound of 0
 * survive as real filters, and an unset status sends no `http_status` predicate
 * at all (NULL-status websocket captures would otherwise vanish).
 */
export function toBackendCaptureFilters(
  filters: Readonly<TransactionStoreFilters>,
  cursor: string | null,
  limit: number,
): CaptureQueryFilters {
  return {
    limit,
    cursor: cursor ?? undefined,
    route: omitBlank(filters.route),
    outcome: omitBlank(filters.outcome),
    kind: omitBlank(filters.kind),
    animeId: omitBlank(filters.animeId),
    errorCode: omitBlank(filters.errorCode),
    deviceId: omitBlank(filters.deviceId),
    httpStatus: filters.httpStatus ?? undefined,
    changelogId: filters.changelogId ?? undefined,
    startMs: filters.startMs ?? undefined,
    endMs: filters.endMs ?? undefined,
  };
}

/** Vanilla backing store for the shared transaction (Activity/Network) read-model. */
export const transactionStore = createStore<TransactionStoreState>()((set) => ({ // eslint-disable-line dharness/role-file-shape -- the store singleton belongs beside its reducers; moving it to a sibling would invert the import between this file and the constants it reads
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
