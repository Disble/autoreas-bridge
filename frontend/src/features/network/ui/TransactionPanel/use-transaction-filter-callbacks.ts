import { useCallback } from 'react';
import type { TransactionStatusClassFilter, TransactionStoreFilters } from '../../../../shared/store/transaction-store/transaction-store.types';

/**
 * Builds the panel's filter-change callbacks. Each one narrows a single field
 * onto `setFilters`, so they are six variations of one idea rather than six
 * decisions; grouping them keeps the parent hook's budget for the work that
 * actually differs.
 * @param setFilters The store's partial-filter setter.
 * @returns One stable callback per filter control.
 */
export function useTransactionFilterCallbacks(setFilters: (filters: Partial<TransactionStoreFilters>) => void) {
  const onRouteChange = useCallback((route: string) => setFilters({ route }), [setFilters]);
  const onOutcomeChange = useCallback((outcome: string) => setFilters({ outcome }), [setFilters]);
  const onKindChange = useCallback((kind: string) => setFilters({ kind }), [setFilters]);
  const onStatusClassChange = useCallback(
    (statusClass: TransactionStatusClassFilter) => setFilters({ statusClass }),
    [setFilters],
  );
  const onQueryChange = useCallback((query: string) => setFilters({ query }), [setFilters]);

  return { onRouteChange, onOutcomeChange, onKindChange, onStatusClassChange, onQueryChange };
}
