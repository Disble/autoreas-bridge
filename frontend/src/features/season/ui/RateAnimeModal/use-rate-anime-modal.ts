import { useCallback } from 'react';
import type { SeasonQuerySource, SeasonSource } from '../../../../shared/contracts/season.types';
import { BRIDGE_SEASON_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { runSeasonCommand, settleSeasonCommand, toSeasonBannerMessage } from '../../../../shared/season/season.helpers';
import { useDisplayedSeasonAnimes } from '../../../../shared/season/use-displayed-season-animes';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import { setSeasonStoreState } from '../../../../shared/store/season-store/season-store.helpers';

/**
 * Records a manual grade and refreshes the shared season rows before settling.
 * @param animeId The anime to grade.
 * @param source The command port.
 * @param querySource The season read port.
 * @returns The grade selection callback.
 */
export function useRateAnimeModal(
  animeId: string,
  source: SeasonSource = BRIDGE_SEASON_SOURCE,
  querySource: SeasonQuerySource = BRIDGE_SEASON_SOURCE,
) {
  // 3. Context/3rd Party Hooks
  const readOnly = useSeasonStore((state) => state.readOnly);

  // 4. Queries/Mutations
  const { refetch } = useDisplayedSeasonAnimes({ refresh: 'never', source: querySource });
  const { mutateAsync } = useBridgeMutation({
    mutationFn: (grade: number) => runSeasonCommand(() => source.setGrade(animeId, grade), 'Failed to record grade'),
    onSuccess: async () => {
      setSeasonStoreState({ errorMessage: undefined });
      await refetch();
    },
    onError: (error) => setSeasonStoreState({ errorMessage: toSeasonBannerMessage(error, { fallback: 'Failed to record grade', fixedMessage: false }) }),
  });

  // 6. Callbacks
  const onSelectGrade = useCallback((grade: number) => {
    if (!readOnly) void settleSeasonCommand(mutateAsync(grade));
  }, [readOnly, mutateAsync]);

  return { onSelectGrade };
}
