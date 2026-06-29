import { useCallback, useEffect } from 'react';
import type { PreferencesSource } from '../../../../infrastructure/preferences-source';
import { preferencesSource } from '../../../../infrastructure/preferences-source';
import { usePreferencesStore } from '../../../../shared/store/preferences-store';
import { getSeasonModeLabel } from './season-mode-panel.helpers';

/**
 * useSeasonModePanel loads the persisted season mode flag on mount (once) and
 * exposes a toggle callback. All Wails I/O lives here; SeasonModePanel.tsx is
 * purely presentational.
 */
export function useSeasonModePanel(source: PreferencesSource = preferencesSource) {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks
  const seasonMode = usePreferencesStore((state) => state.seasonMode);
  const hasLoaded = usePreferencesStore((state) => state.hasLoaded);
  const errorMessage = usePreferencesStore((state) => state.errorMessage);
  const refresh = usePreferencesStore((state) => state.refresh);
  const setSeasonMode = usePreferencesStore((state) => state.setSeasonMode);

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const isLoading = !hasLoaded;
  const label = getSeasonModeLabel(seasonMode);

  // 6. Callbacks (useCallback calling pure helpers)
  const toggle = useCallback(async () => {
    await setSeasonMode(source, !seasonMode);
  }, [source, seasonMode, setSeasonMode]);

  // 7. Effects
  useEffect(() => {
    void refresh(source);
  }, [refresh, source]);

  return {
    seasonMode,
    isLoading,
    label,
    errorMessage,
    toggle,
  };
}
