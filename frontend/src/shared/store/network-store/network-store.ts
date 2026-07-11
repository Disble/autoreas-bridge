import { useStore } from 'zustand';
import { networkStore } from './network-store.helpers';
import type { NetworkStoreState } from './network-store.types';

/** Reads and subscribes to the Network store, optionally through a selector. */
export function useNetworkStore<T = NetworkStoreState>(
  selector: (state: NetworkStoreState) => T = ((state: NetworkStoreState) => state as T),
): T {
  return useStore(networkStore, selector);
}
