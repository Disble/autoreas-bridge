import { useStore } from 'zustand';
import { preferencesStore } from './preferences-store.helpers';
import type { PreferencesStoreState } from './preferences-store.types';

/** Reads and subscribes to the Preferences store, optionally through a selector. */
export function usePreferencesStore<T = PreferencesStoreState>(
  selector: (state: PreferencesStoreState) => T = ((state: PreferencesStoreState) => state as T),
): T {
  return useStore(preferencesStore, selector);
}
