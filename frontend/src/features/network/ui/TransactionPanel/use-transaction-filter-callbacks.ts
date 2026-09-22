import { useCallback } from 'react';
import type { TransactionStoreFilters } from '../../../../shared/store/transaction-store/transaction-store.types';
import { SYNC_DIAGNOSTICS_ROUTE } from './transaction-panel.constants';
import { toStatusFilter } from './transaction-panel.helpers';

/**
 * Builds the panel's filter-change callbacks. Each one narrows a single field
 * onto `setFilters`, so they are variations of one idea rather than separate
 * decisions; grouping them keeps the parent hook's budget for the work that
 * actually differs.
 *
 * Every one of them changes a filter the BACKEND evaluates over the whole
 * capture table. There is no client-only setter left here.
 * @param setFilters The store's partial-filter setter.
 * @returns One stable callback per filter control.
 */
export function useTransactionFilterCallbacks(setFilters: (filters: Partial<TransactionStoreFilters>) => void) {
  const onRouteChange = useCallback((route: string) => setFilters({ route }), [setFilters]);
  const onOutcomeChange = useCallback((outcome: string) => setFilters({ outcome }), [setFilters]);
  const onKindChange = useCallback((kind: string) => setFilters({ kind }), [setFilters]);
  const onStatusChange = useCallback((status: string) => setFilters({ httpStatus: toStatusFilter(status) }), [setFilters]);

  /**
   * Applies the sync diagnostics route filter in one action, through the same
   * backend-evaluated `setFilters` path as every other control — the owner
   * reaches the diagnostics rows without knowing the route string, and the
   * result is an honest server-side query, not a client-side narrowing.
   */
  const onSyncDiagnosticsRoute = useCallback(() => setFilters({ route: SYNC_DIAGNOSTICS_ROUTE }), [setFilters]);

  return { onRouteChange, onOutcomeChange, onKindChange, onStatusChange, onSyncDiagnosticsRoute };
}
