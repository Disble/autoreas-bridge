import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import type { OrderingBoardStoreBindings } from './ordering-board.types';

/**
 * Subscribes to the Season store slices used by the ordering board.
 * @returns The season state and actions consumed by the ordering board hook.
 */
export function useOrderingBoardStoreBindings(): OrderingBoardStoreBindings {
  const closeSeason = useSeasonStore((store) => store.closeSeason);
  const readOnly = useSeasonStore((store) => store.readOnly);
  const viewSeasonId = useSeasonStore((store) => store.viewSeasonId);
  const seasonAnimes = useSeasonStore((store) => store.seasonAnimes);
  const ensureAnimesLoaded = useSeasonStore((store) => store.ensureAnimesLoaded);
  const errorMessage = useSeasonStore((store) => store.errorMessage);

  return { closeSeason, readOnly, viewSeasonId, seasonAnimes, ensureAnimesLoaded, errorMessage };
}
