import { isSeasonOpen } from '../../../../shared/store/season-store/season-store.helpers';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';

/**
 * Returns whether a season is currently open, driving the Today page's slim
 * season banner visibility. Reads the shared Season store selector directly and
 * resolves it through the shared `isSeasonOpen` predicate, so the closed
 * historical season that `viewPastSeason` loads never reads as open.
 */
export function useTodaySeasonBanner(): boolean {
  return useSeasonStore((state) => isSeasonOpen(state.season));
}
