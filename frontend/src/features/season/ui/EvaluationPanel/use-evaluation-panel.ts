import { useCallback, useMemo } from 'react';
import type { SeasonQuerySource, SeasonSource } from '../../../../shared/contracts/season.types';
import { useProgressiveListWindow } from '../../../../shared/hooks/use-progressive-list-window';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import { BRIDGE_ANIME_SOURCE, BRIDGE_SEASON_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { SEASON_ANIMES_REFRESH_BANNER, SEASON_NO_ROWS } from '../../../../shared/season/season.constants';
import { runSeasonCommand, settleSeasonCommand, toSeasonBannerMessage } from '../../../../shared/season/season.helpers';
import { useDisplayedSeasonAnimes } from '../../../../shared/season/use-displayed-season-animes';
import { useSeasonBannerSync } from '../../../../shared/season/use-season-banner-sync';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import { setSeasonStoreState } from '../../../../shared/store/season-store/season-store.helpers';
import type { SeasonCoverSource } from '../SeasonCoverThumb/season-cover-thumb.types';
import { useSeasonCovers } from '../SeasonCoverThumb/use-season-covers';
import { buildEvaluationView } from './evaluation-panel.helpers';

/**
 * Reads evaluation candidates through the shared season query and records skip overrides.
 * @param source The season read and command port.
 * @param coverSource The cover port.
 * @returns The evaluation view and its actions.
 */
export function useEvaluationPanel(
  source: SeasonSource & SeasonQuerySource = BRIDGE_SEASON_SOURCE,
  coverSource: SeasonCoverSource = BRIDGE_ANIME_SOURCE,
) {
  // 3. Context/3rd Party Hooks
  const readOnly = useSeasonStore((state) => state.readOnly);
  const errorMessage = useSeasonStore((state) => state.errorMessage);

  // 4. Queries/Mutations
  const query = useDisplayedSeasonAnimes({ refresh: 'mount', source });
  const { mutateAsync } = useBridgeMutation({
    mutationFn: (rowId: string) => runSeasonCommand(() => source.skipGrading(rowId), 'Failed to skip grading'),
    onSuccess: async () => {
      setSeasonStoreState({ errorMessage: undefined });
      await query.refetch();
    },
    onError: (error) => setSeasonStoreState({ errorMessage: toSeasonBannerMessage(error, { fallback: 'Failed to skip grading', fixedMessage: false }) }),
  });
  useSeasonBannerSync(query, SEASON_ANIMES_REFRESH_BANNER);

  // 5. Derived State
  const seasonAnimes = query.isPlaceholderData ? SEASON_NO_ROWS : query.data ?? SEASON_NO_ROWS;
  const { items, ungradedCount, animeIds } = useMemo(() => buildEvaluationView(seasonAnimes), [seasonAnimes]);
  const view = query.isPlaceholderData ? { kind: 'loading' as const } : toAsyncView(query, () => items.length === 0);
  const getCoverThumb = useSeasonCovers(animeIds, coverSource);
  const window = useProgressiveListWindow(items.length);

  // 6. Callbacks
  const onSkip = useCallback((rowId: string) => {
    if (!readOnly) void settleSeasonCommand(mutateAsync(rowId));
  }, [readOnly, mutateAsync]);

  return { readOnly, items: items.slice(0, window.visibleCount), ungradedCount, errorMessage, view, onSkip, getCoverThumb, listWindow: window };
}
