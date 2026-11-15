import { SEASON_ANIMES_ENSURE_BANNER } from '../../../../shared/season/season.constants';
import { useDisplayedSeasonAnimes } from '../../../../shared/season/use-displayed-season-animes';
import { useSeasonBannerSync } from '../../../../shared/season/use-season-banner-sync';
import { isSeasonOpen } from '../../../../shared/store/season-store/season-store.helpers';
import type { SeasonWorkspaceAnimesLoadParams } from './season-workspace.types';

/**
 * Loads the open season's animes for the Season Workspace and reports whether it is
 * still waiting for them. The workspace gates its panels on that answer, so the panels
 * never mount (and never render a resolved-empty state) before the rows have resolved.
 * A failed load shows the fixed intake-rows text on the banner and releases the gate.
 * @returns `true` while an open, live season's animes are unresolved.
 */
export function useSeasonWorkspaceAnimesLoad({ season, readOnly, source }: Readonly<SeasonWorkspaceAnimesLoadParams>): boolean {
  // 4. Queries/Mutations
  const isLive = isSeasonOpen(season) && !readOnly;
  const animesQuery = useDisplayedSeasonAnimes({ refresh: isLive ? 'mount' : 'never', source });

  // 7. Effects
  useSeasonBannerSync(animesQuery, SEASON_ANIMES_ENSURE_BANNER);

  return isLive && animesQuery.status === 'pending';
}
