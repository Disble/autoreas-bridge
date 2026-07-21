import { useSeasonStore } from '../../../../shared/store/season-store/season-store';

/**
 * Returns whether a season is currently open, driving the Today page's slim
 * season banner visibility. Reads the shared Season store selector directly.
 */
export function useTodaySeasonBanner(): boolean {
  return useSeasonStore((state) => state.season !== null);
}
