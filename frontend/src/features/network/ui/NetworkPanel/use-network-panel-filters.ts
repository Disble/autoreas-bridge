import { useMemo } from 'react';
import { useDebounce } from '../../../../shared/hooks/use-debounce';
import { NETWORK_FILTER_DEBOUNCE_MS } from './network-panel.constants';
import type { useNetworkStoreBindings } from './use-network-store-bindings';

/**
 * Owns the rail's SETTLED filter object: the memoized `{ query, level, domain }`
 * triple from the store, debounced as ONE app-wide `useDebounce` over the whole
 * memoized `filters` object — never one call per field — so one typing burst
 * produces exactly one query (and therefore no skeleton flicker) after the user
 * pauses. Split out of `useNetworkPanel` so the panel composes this contract
 * instead of carrying its subtlety inline.
 *
 * `useDebounce` compares by identity, and the memo below rebuilds `filters` only
 * when one of the three store primitives changes, so the identity is stable
 * across unrelated renders — debouncing a fresh object identity instead would
 * restart the timer forever. Debouncing the whole object is also what keeps
 * every field on equal footing: any change to any field triggers exactly one
 * settled query.
 *
 * The input text itself stays immediate — the store's fields update per
 * keystroke, and the live push admission reads that snapshot — only the query is
 * delayed. Every downstream consumer (the query effect and `loadMore` in
 * `use-network-panel-sync`) already reads the settled values.
 * @param store The bound network store whose filter fields are settled.
 * @returns The debounced filter object every query machinery must read.
 */
export function useNetworkPanelFilters(store: ReturnType<typeof useNetworkStoreBindings>) {
  // 4. Queries/Mutations
  /** Memoized filter triple; rebuilt only when a store filter primitive changes. */
  const filters = useMemo(
    () => ({ query: store.query, level: store.levelFilter, domain: store.domainFilter }),
    [store.domainFilter, store.levelFilter, store.query],
  );

  return useDebounce(filters, NETWORK_FILTER_DEBOUNCE_MS);
}
