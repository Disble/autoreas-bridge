import { useShallow } from 'zustand/react/shallow';
import { useNetworkStore } from '../../../../shared/store/network-store/network-store';

/**
 * Binds every slice of the Network store the Runtime Events rail reads or
 * writes, in two shallow-compared subscriptions.
 *
 * Extracted for the same reason `useTransactionStoreBindings` was: keeping the
 * subscriptions inline made `useNetworkPanel` a thirty-four-hook function the
 * complexity gate flagged, for what is really a single concern — "the store, as
 * this rail sees it".
 *
 * Two subscriptions rather than one per slice, because eighteen
 * `useNetworkStore` calls just moved the same complexity into this file. The
 * actions never change identity, so their selector never re-renders; the value
 * selector groups slices the rail reads together anyway, so grouping them costs
 * no extra render (`season-store.render-contract.test.tsx` pins why the shallow
 * comparator is required for an object selector).
 * @returns Every store value and action the rail and its sync hook need.
 */
export function useNetworkStoreBindings() {
  const values = useNetworkStore(
    useShallow((state) => ({
      page: state.page,
      overlay: state.overlay,
      nextCursor: state.nextCursor,
      isLoadingMore: state.isLoadingMore,
      available: state.available,
      domainOptions: state.domainOptions,
      selectedId: state.selectedId,
      query: state.query,
      levelFilter: state.levelFilter,
      domainFilter: state.domainFilter,
    })),
  );
  const actions = useNetworkStore(
    useShallow((state) => ({
      select: state.select,
      setQuery: state.setQuery,
      setLevelFilter: state.setLevelFilter,
      setDomainFilter: state.setDomainFilter,
      setPage: state.setPage,
      setAvailable: state.setAvailable,
      setLoadingMore: state.setLoadingMore,
      setDomainOptions: state.setDomainOptions,
    })),
  );

  return { ...values, ...actions };
}
