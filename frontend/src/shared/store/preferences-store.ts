import { create } from 'zustand';

import type { PreferencesSource } from '../../infrastructure/preferences-source';
import { preferencesSource } from '../../infrastructure/preferences-source';

interface PreferencesStoreState {
  readonly seasonMode: boolean;
  readonly hasLoaded: boolean;
  readonly errorMessage?: string;
  readonly refresh: (source?: PreferencesSource) => Promise<void>;
  readonly setSeasonMode: (source: PreferencesSource, enabled: boolean) => Promise<void>;
}

/**
 * usePreferencesStore is the single frontend read-model for user preferences.
 * Wails remains behind PreferencesSource; this store exposes the persisted
 * season mode flag to all consumers without direct Wails binding calls.
 * Load-once semantics: refresh() no-ops if hasLoaded is already true.
 */
export const usePreferencesStore = create<PreferencesStoreState>((set, get) => ({
  seasonMode: false,
  hasLoaded: false,
  errorMessage: undefined,

  refresh: async (source: PreferencesSource = preferencesSource) => {
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

  setSeasonMode: async (source: PreferencesSource, enabled: boolean) => {
    const previousValue = get().seasonMode;

    set({ seasonMode: enabled, errorMessage: undefined });

    try {
      const result = await source.setSeasonMode(enabled);

      if (result !== 'ok') {
        set({ seasonMode: previousValue, errorMessage: result || 'Failed to save season mode' });
      }
    } catch (error) {
      set({
        seasonMode: previousValue,
        errorMessage: error instanceof Error ? error.message : 'Failed to save season mode',
      });
    }
  },
}));

/** Test-only seam: reset preferences store back to initial state. */
export function resetPreferencesStore(): void {
  usePreferencesStore.setState({
    seasonMode: false,
    hasLoaded: false,
    errorMessage: undefined,
  });
}
