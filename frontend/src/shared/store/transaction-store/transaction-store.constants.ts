import type { TransactionStoreFilters } from './transaction-store.types';

/** The TransactionPanel's initial (no-op) filter set. */
export const DEFAULT_TRANSACTION_FILTERS: TransactionStoreFilters = {
  route: '',
  outcome: '',
  kind: '',
  statusClass: 'all',
  query: '',
};
