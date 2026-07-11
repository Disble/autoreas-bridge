import { useStore } from 'zustand';
import { seasonStore } from './season-store.helpers';
import type { SeasonStoreState } from './season-store.types';

/** Reads and subscribes to the Season store, optionally through a selector. */
export function useSeasonStore<T = SeasonStoreState>(
  selector: (state: SeasonStoreState) => T = ((state: SeasonStoreState) => state as T),
): T {
  return useStore(seasonStore, selector);
}
