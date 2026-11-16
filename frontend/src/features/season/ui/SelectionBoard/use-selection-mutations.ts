import { useCallback } from 'react';
import type { ConfirmSelectionResult, SeasonQuerySource, SeasonSource } from '../../../../shared/contracts/season.types';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { runSeasonCommand, settleSeasonCommand, toSeasonBannerMessage } from '../../../../shared/season/season.helpers';
import { useDisplayedSeason } from '../../../../shared/season/use-displayed-season';
import { useDisplayedSeasonAnimes } from '../../../../shared/season/use-displayed-season-animes';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import { setSeasonStoreState } from '../../../../shared/store/season-store/season-store.helpers';

/**
 * Runs selection commands and refreshes the season reads in their original order.
 * @param source The season query and command port.
 * @returns Consideration and confirmation commands.
 */
export function useSelectionMutations(source: SeasonSource & SeasonQuerySource) {
  // 3. Context/3rd Party Hooks
  const readOnly = useSeasonStore((state) => state.readOnly);

  // 4. Queries/Mutations
  const { refetch: refetchSeason } = useDisplayedSeason({ refresh: 'never', source });
  const { refetch: refetchAnimes } = useDisplayedSeasonAnimes({ refresh: 'never', source });
  const consideration = useBridgeMutation({
    mutationFn: ({ rowId, value }: { readonly rowId: string; readonly value: string }) =>
      runSeasonCommand(() => source.setConsideration(rowId, value), 'Failed to set consideration'),
    onSuccess: async () => { setSeasonStoreState({ errorMessage: undefined }); await refetchAnimes(); },
    onError: (error) => setSeasonStoreState({ errorMessage: toSeasonBannerMessage(error, { fallback: 'Failed to set consideration', fixedMessage: false }) }),
  });
  const confirmation = useBridgeMutation({
    mutationFn: () => source.confirmSelection(),
    onSuccess: async (result) => {
      if (result.status !== 'ok') {
        setSeasonStoreState({ errorMessage: result.status || 'Failed to confirm selection' });
        return;
      }
      setSeasonStoreState({ errorMessage: undefined });
      await refetchSeason();
      await refetchAnimes();
    },
    onError: (error) => setSeasonStoreState({ errorMessage: toSeasonBannerMessage(error, { fallback: 'Failed to confirm selection', fixedMessage: false }) }),
  });

  // 6. Callbacks
  const setConsideration = useCallback((rowId: string, value: string) => {
    if (!readOnly) void settleSeasonCommand(consideration.mutateAsync({ rowId, value }));
  }, [consideration, readOnly]);
  const confirmSelection = useCallback(async (): Promise<ConfirmSelectionResult> => {
    if (readOnly) return { status: 'read-only', approved: 0, rejected: 0, quotaExceeded: false };
    try {
      return await confirmation.mutateAsync();
    } catch (error) {
      return { status: toSeasonBannerMessage(error, { fallback: 'Failed to confirm selection', fixedMessage: false }), approved: 0, rejected: 0, quotaExceeded: false };
    }
  }, [confirmation, readOnly]);

  return { setConsideration, confirmSelection };
}
