import { createStore } from 'zustand/vanilla';
import { preferencesSource } from '../../../infrastructure/preferences-source/preferences-source.helpers';
import type { PreferencesStoreState } from './preferences-store.types';

/** Vanilla backing store for the shared Preferences read-model. */
export const preferencesStore = createStore<PreferencesStoreState>()((set, get) => ({
  seasonMode: false,
  hasLoaded: false,
  errorMessage: undefined,

  refresh: async (source = preferencesSource) => {
    if (get().hasLoaded) {
      return;
    }

    try {
      const seasonMode = await source.getSeasonMode();
      set({ seasonMode, hasLoaded: true, errorMessage: undefined });
    } catch (error) {
      set({
        hasLoaded: true,
        errorMessage: error instanceof Error ? error.message : 'Failed to load preferences',
      });
    }
  },
}));

/** Reads the current Preferences store snapshot outside React render. */
export function getPreferencesStoreState(): PreferencesStoreState {
  return preferencesStore.getState();
}

/** Writes a partial Preferences store snapshot outside React render. */
function setPreferencesStoreState(partial: Partial<PreferencesStoreState>): void {
  preferencesStore.setState(partial);
}

/** Resets the preferences read-model back to its safe defaults for tests. */
export function resetPreferencesStore(): void {
  setPreferencesStoreState({
    seasonMode: false,
    hasLoaded: false,
    errorMessage: undefined,
  });
}
