import { create } from 'zustand';

import { observabilityLogSource } from '../../infrastructure/observability-log-source';
import type { ObservabilityLogSource } from '../../infrastructure/observability-log-source';
import { MAX_LOG_ENTRIES } from './network-store.constants';
import { keepRecent } from './network-store.helpers';
import type { NetworkStoreState } from './network-store.types';

/**
 * useNetworkStore is the Zustand read-model for the Network tab. It holds the
 * raw capped event buffer as the single source of truth (append+cap, NOT
 * replace) plus selection/filter state. The pure correlationId fold lives in
 * `network-store.helpers.ts` and is applied on read, never inside this store.
 */
export const useNetworkStore = create<NetworkStoreState>((set) => ({
  buffer: [],
  selectedId: null,
  query: '',
  statusFilter: 'all',
  ingest: (entry) =>
    set((state) => ({
      buffer: keepRecent([...state.buffer, entry], MAX_LOG_ENTRIES),
    })),
  seed: (entries) => set({ buffer: keepRecent(entries, MAX_LOG_ENTRIES) }),
  select: (id) => set({ selectedId: id }),
  setQuery: (query) => set({ query }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
}));

/**
 * bridgeUnsubscribe guards the single-subscription bridge so repeated
 * connectNetworkStore calls (e.g. multiple consumers) do not double-subscribe.
 */
let bridgeUnsubscribe: (() => void) | null = null;

/**
 * connectNetworkStore wires an observability log source into the store as a
 * single bridge: it seeds the store with `getRecentLogs()` and then ingests
 * every subsequent live event. Idempotent — later calls return the live
 * teardown. Pass a fake source in tests; defaults to the shared runtime
 * source in production.
 */
export function connectNetworkStore(source: ObservabilityLogSource = observabilityLogSource): () => void {
  if (bridgeUnsubscribe !== null) {
    return bridgeUnsubscribe;
  }

  const { ingest, seed } = useNetworkStore.getState();
  void source.getRecentLogs().then(seed);
  const unsubscribe = source.subscribe(ingest);

  bridgeUnsubscribe = () => {
    unsubscribe();
    bridgeUnsubscribe = null;
  };

  return bridgeUnsubscribe;
}

/**
 * resetNetworkStore tears down the bridge and clears state. Test-only seam so
 * each test starts from a clean, disconnected store.
 */
export function resetNetworkStore(): void {
  if (bridgeUnsubscribe !== null) {
    bridgeUnsubscribe();
  }
  useNetworkStore.setState({
    buffer: [],
    selectedId: null,
    query: '',
    statusFilter: 'all',
  });
}
