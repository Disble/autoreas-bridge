import { useTransactionStore } from '../../../../shared/store/transaction-store/use-transaction-store';

/**
 * Binds every slice of the transaction store the panel reads or writes.
 *
 * Zustand wants one subscription per slice so a component re-renders only for
 * the slices it uses, which means thirteen `useTransactionStore` calls. Keeping
 * them in `useTransactionPanel` put thirteen of its thirty hook calls here, for
 * what is really a single concern: "the store, as this panel sees it".
 * @returns Every store value and action the panel needs.
 */
export function useTransactionStoreBindings() {
  const items = useTransactionStore((state) => state.items);
  const selectedId = useTransactionStore((state) => state.selectedId);
  const selectedDetail = useTransactionStore((state) => state.selectedDetail);
  const filters = useTransactionStore((state) => state.filters);
  const degraded = useTransactionStore((state) => state.degraded);
  const isLoading = useTransactionStore((state) => state.isLoading);
  const setPage = useTransactionStore((state) => state.setPage);
  const upsertRows = useTransactionStore((state) => state.upsertRows);
  const setFilters = useTransactionStore((state) => state.setFilters);
  const select = useTransactionStore((state) => state.select);
  const setSelectedDetail = useTransactionStore((state) => state.setSelectedDetail);
  const setDegraded = useTransactionStore((state) => state.setDegraded);
  const setLoading = useTransactionStore((state) => state.setLoading);

  return {
    items,
    selectedId,
    selectedDetail,
    filters,
    degraded,
    isLoading,
    setPage,
    upsertRows,
    setFilters,
    select,
    setSelectedDetail,
    setDegraded,
    setLoading,
  };
}
