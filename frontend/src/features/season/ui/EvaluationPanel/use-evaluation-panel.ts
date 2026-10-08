import { useCallback, useEffect, useMemo } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import { seasonSource } from '../../../../infrastructure/season-source/season-source.helpers';
import type { SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import type { SeasonCoverSource } from '../SeasonCoverThumb/season-cover-thumb.types';
import { useSeasonCovers } from '../SeasonCoverThumb/use-season-covers';
import { buildEvaluationView } from './evaluation-panel.helpers';

/**
 * useEvaluationPanel drives the Evaluation progress list: created candidates with
 * their grade, source, rated-at and cover, ungraded first, plus a per-row skip
 * override. Grading itself flows through the shared RateAnimeModal; this hook
 * owns the list + skip. All Wails I/O flows through the season store and
 * refreshes on mount or mutation; covers resolve once per anime.
 *
 * @param source The season port the store reads and writes through.
 * @param coverSource The port each row's cover is resolved through.
 */
export function useEvaluationPanel(source: SeasonSource = seasonSource, coverSource: SeasonCoverSource = bridgeRuntimeSource) {
  // 3. Context/3rd Party Hooks
  const seasonAnimes = useSeasonStore((state) => state.seasonAnimes);
  const readOnly = useSeasonStore((state) => state.readOnly);
  const errorMessage = useSeasonStore((state) => state.errorMessage);
  const refreshAnimes = useSeasonStore((state) => state.refreshAnimes);
  const skipGrading = useSeasonStore((state) => state.skipGrading);

  // 5. Derived State (useMemo)
  const { items, ungradedCount, animeIds } = useMemo(() => buildEvaluationView(seasonAnimes), [seasonAnimes]);
  const getCoverThumb = useSeasonCovers(animeIds, coverSource);

  // 6. Callbacks
  const onSkip = useCallback(
    (rowId: string) => {
      void skipGrading(source, rowId);
    },
    [skipGrading, source],
  );

  // 7. Effects
  useEffect(() => {
    void refreshAnimes(source);
  }, [refreshAnimes, source]);

  return {
    readOnly,
    items,
    ungradedCount,
    errorMessage,
    onSkip,
    getCoverThumb,
  };
}
