import type { CaptureDetail, CaptureRow } from '../../contracts/capture.types';

/** Client-side HTTP status-class bucket applied over the currently loaded page. */
export type TransactionStatusClassFilter = 'all' | '2xx' | '3xx' | '4xx' | '5xx';

/** The active filter set for the TransactionPanel feature. */
export interface TransactionStoreFilters {
  readonly route: string;
  readonly outcome: string;
  readonly kind: string;
  readonly statusClass: TransactionStatusClassFilter;
  readonly query: string;
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
