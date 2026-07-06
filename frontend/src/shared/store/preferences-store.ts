import { create } from 'zustand';

import type { PreferencesSource } from '../../infrastructure/preferences-source';
import { preferencesSource } from '../../infrastructure/preferences-source';

interface PreferencesStoreState {
  readonly seasonMode: boolean;
  readonly hasLoaded: boolean;
  readonly errorMessage?: string;
  readonly refresh: (source?: PreferencesSource) => Promise<void>;
}

/**
 * usePreferencesStore is the single frontend READ-model for the derived season
 * mode flag (SDD-41b: season mode is on iff a season is open; it is changed only
 * via the Season section, never toggled here). Consumers (Chapters, Downloads
 * schedule) read it without direct Wails binding calls. Load-once semantics:
 * refresh() no-ops if hasLoaded is already true.
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
}));

/** Test-only seam: reset preferences store back to initial state. */
export function resetPreferencesStore(): void {
  usePreferencesStore.setState({
    seasonMode: false,
    hasLoaded: false,
    errorMessage: undefined,
  });
}
