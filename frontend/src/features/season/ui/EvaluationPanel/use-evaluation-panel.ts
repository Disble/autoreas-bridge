import { useCallback, useEffect, useMemo } from 'react';
import type { SeasonSource } from '../../../../infrastructure/season-source';
import { seasonSource } from '../../../../infrastructure/season-source';
import { useSeasonStore } from '../../../../shared/store/season-store';
import { countUngraded, toEvaluationRows } from './evaluation-panel.helpers';

/**
 * useEvaluationPanel drives the Evaluation progress list: created candidates with
 * their grade, source, and rated-at, plus a per-row skip override. Grading itself
 * flows through the shared RateAnimeModal; this hook owns the list + skip. All
 * Wails I/O flows through the season store, refreshed live on `season_changed`.
 */
export function useEvaluationPanel(source: SeasonSource = seasonSource) {
  // 3. Context/3rd Party Hooks
  const seasonAnimes = useSeasonStore((state) => state.seasonAnimes);
  const readOnly = useSeasonStore((state) => state.readOnly);
  const errorMessage = useSeasonStore((state) => state.errorMessage);
  const refreshAnimes = useSeasonStore((state) => state.refreshAnimes);
  const skipGrading = useSeasonStore((state) => state.skipGrading);

  // 5. Derived State (useMemo)
  const rows = useMemo(() => toEvaluationRows(seasonAnimes), [seasonAnimes]);
  const ungradedCount = useMemo(() => countUngraded(rows), [rows]);

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
    rows,
    ungradedCount,
    errorMessage,
    onSkip,
  };
}
