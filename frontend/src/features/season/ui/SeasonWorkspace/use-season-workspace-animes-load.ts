import { useEffect } from 'react';
import { isSeasonOpen } from '../../../../shared/store/season-store/season-store.helpers';
import type { SeasonWorkspaceAnimesLoadParams } from './season-workspace.types';

/**
 * Loads the open season's animes for the Season Workspace and reports whether it is
 * still waiting for them. The workspace gates its panels on that answer, so the panels
 * never mount (and never render a resolved-empty state) before the rows have resolved.
 * @returns `true` while an open, live season's animes are `idle` or `loading`.
 */
export function useSeasonWorkspaceAnimesLoad({
  season,
  readOnly,
  animesLoadState,
  ensureAnimesLoaded,
  source,
}: Readonly<SeasonWorkspaceAnimesLoadParams>): boolean {
  // 5. Derived State
  const isLive = isSeasonOpen(season) && !readOnly;
  const isAwaitingAnimes = isLive && (animesLoadState === 'idle' || animesLoadState === 'loading');
  const shouldLoad = isLive && animesLoadState === 'idle';

  // 7. Effects
  useEffect(() => {
    if (shouldLoad) {
      void ensureAnimesLoaded(source);
    }
  }, [shouldLoad, ensureAnimesLoaded, source]);

  return isAwaitingAnimes;
}
