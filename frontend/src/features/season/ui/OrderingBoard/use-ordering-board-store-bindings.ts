import { useCallback } from 'react';
import { BRIDGE_SEASON_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { SEASON_ANIMES_ENSURE_BANNER, SEASON_NO_ROWS } from '../../../../shared/season/season.constants';
import type { SeasonDataSource } from '../../../../shared/season/season.types';
import { useDisplayedSeasonAnimes } from '../../../../shared/season/use-displayed-season-animes';
import { useSeasonBannerSync } from '../../../../shared/season/use-season-banner-sync';
import { useSeasonLifecycleCommands } from '../../../../shared/season/use-season-lifecycle-commands';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import type { OrderingBoardStoreBindings } from './ordering-board.types';

/**
 * Binds the ordering board to the season: the displayed season's rows (grades
 * and desktop actions), loaded once per session and shown as an empty list
 * until they arrive, the close command, and the store's view state and banner.
 * The rows load when the board mounts, so `ensureAnimesLoaded` has nothing left
 * to do and resolves at once.
 * @param source The port the rows read and the close command go through.
 * @returns The season state and actions consumed by the ordering board hook.
 */
export function useOrderingBoardStoreBindings(source: SeasonDataSource = BRIDGE_SEASON_SOURCE): OrderingBoardStoreBindings {
  // 3. Context/3rd Party Hooks
  const readOnly = useSeasonStore((store) => store.readOnly);
  const viewSeasonId = useSeasonStore((store) => store.viewSeasonId);
  const errorMessage = useSeasonStore((store) => store.errorMessage);

  // 4. Queries/Mutations
  const animesQuery = useDisplayedSeasonAnimes({ refresh: 'once', source });
  const { closeSeason } = useSeasonLifecycleCommands(source);

  // 6. Callbacks
  const ensureAnimesLoaded = useCallback(() => Promise.resolve(), []);

  // 7. Effects
  useSeasonBannerSync(animesQuery, SEASON_ANIMES_ENSURE_BANNER);

  return { closeSeason, readOnly, viewSeasonId, seasonAnimes: animesQuery.data ?? SEASON_NO_ROWS, ensureAnimesLoaded, errorMessage };
}
