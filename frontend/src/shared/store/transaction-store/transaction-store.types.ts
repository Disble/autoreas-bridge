import type { CaptureDetail, CaptureRow } from '../../contracts/capture.types';

/**
 * The active filter set for the TransactionPanel feature.
 *
 * Every field here is evaluated by the backend over the whole capture table.
 * There are deliberately no client-only fields left: a filter applied over the
 * rows already loaded can only narrow the page it was handed, so a match one
 * page further down stays invisible no matter how far the user pages.
 *
 * `''` and `null` both mean "unset", and an unset field is omitted from the
 * query rather than sent as a zero value. That distinction is load-bearing for
 * `httpStatus`: the reader adds `http_status = ?` only when a status arrives,
 * and 537 of 1,317 stored captures (measured 2026-08-30) are websocket rows
 * carrying no status at all, so a defaulted status would erase every one of
 * them. `changelogId` and the time bounds are numbers for the same reason `Go`
 * keeps them pointers -- 0 is a real changelog id and a real epoch bound.
 */
export interface TransactionStoreFilters {
  readonly route: string;
  readonly outcome: string;
  readonly kind: string;
  readonly animeId: string;
  readonly errorCode: string;
  readonly deviceId: string;
  readonly httpStatus: number | null;
  readonly changelogId: number | null;
  readonly startMs: number | null;
  readonly endMs: number | null;
}

/** How a freshly-fetched page is merged into the store's item buffer. */
export type TransactionPageMode = 'replace' | 'append';

/**
 * TransactionStoreState is the Zustand read-model for the transaction
 * (Activity/Network) feature: the current page buffer plus filter,
 * selection, pagination cursor, and degraded-flag state. Fetching itself
 * happens in `use-transaction-panel.ts`; the store only holds state and
 * pure reducer-shaped setters.
 */
export interface TransactionStoreState {
  readonly items: readonly CaptureRow[];
  readonly nextCursor: string | null;
  readonly selectedId: string | null;
  readonly selectedDetail: CaptureDetail | null;
  readonly filters: TransactionStoreFilters;
  readonly degraded: boolean;
  readonly isLoading: boolean;
  readonly setPage: (items: readonly CaptureRow[], nextCursor: string | null, mode: TransactionPageMode) => void;
  readonly upsertRows: (rows: readonly CaptureRow[]) => void;
  readonly setFilters: (filters: Partial<TransactionStoreFilters>) => void;
  readonly select: (id: string | null) => void;
  readonly setSelectedDetail: (detail: CaptureDetail | null) => void;
  readonly setDegraded: (degraded: boolean) => void;
  readonly setLoading: (isLoading: boolean) => void;
  readonly reset: () => void;
}
