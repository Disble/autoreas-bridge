import { useCallback, useState } from 'react';
import type { SeasonSnapshot, SeasonSource } from '../../../../shared/contracts/season.types';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { runSeasonCommand, settleSeasonCommand, toSeasonBannerMessage } from '../../../../shared/season/season.helpers';
import { setSeasonStoreState } from '../../../../shared/store/season-store/season-store.helpers';

/** Local overrides attached to the snapshot they were edited against. */
interface RuleOverrides {
  /** Snapshot used as the edit base. */
  readonly season: SeasonSnapshot | null | undefined;
  /** Optimistic minimum grade. */
  readonly grade?: number;
  /** Optimistic slot cap. */
  readonly slots?: number;
}

/**
 * Applies selection rule edits locally, rolling back failures without refetching on success.
 * @param source The season command port.
 * @param season The currently queried season.
 * @param readOnly Whether edits are disabled.
 * @returns Optimistic rule values and their callbacks.
 */
export function useSelectionOptimisticRules(source: SeasonSource, season: SeasonSnapshot | null | undefined, readOnly: boolean) {
  // 2. State
  const [overrides, setOverrides] = useState<RuleOverrides>({ season });

  // 4. Queries/Mutations
  const grade = useBridgeMutation({ mutationFn: (value: number) => runSeasonCommand(() => source.setMinApprovalGrade(value), 'Failed to update minimum approval grade') });
  const slots = useBridgeMutation({ mutationFn: (value: number) => runSeasonCommand(() => source.setSlots(value), 'Failed to update slots') });

  // 5. Derived State
  const current = overrides.season === season ? overrides : { season };

  // 6. Callbacks
  const onSetMinApprovalGrade = useCallback((value: number) => {
    if (readOnly) return;
    setOverrides((previous) => ({ ...(previous.season === season ? previous : { season }), grade: value }));
    setSeasonStoreState({ errorMessage: undefined });
    void settleSeasonCommand(grade.mutateAsync(value).catch((error: unknown) => {
      setOverrides((previous) => previous.season === season && previous.grade === value ? { ...previous, grade: current.grade } : previous);
      setSeasonStoreState({ errorMessage: toSeasonBannerMessage(error, { fallback: 'Failed to update minimum approval grade', fixedMessage: false }) });
      throw error;
    }));
  }, [current, grade, readOnly, season]);
  const onSetSlots = useCallback((value: number) => {
    if (readOnly) return;
    setOverrides((previous) => ({ ...(previous.season === season ? previous : { season }), slots: value }));
    setSeasonStoreState({ errorMessage: undefined });
    void settleSeasonCommand(slots.mutateAsync(value).catch((error: unknown) => {
      setOverrides((previous) => previous.season === season && previous.slots === value ? { ...previous, slots: current.slots } : previous);
      setSeasonStoreState({ errorMessage: toSeasonBannerMessage(error, { fallback: 'Failed to update slots', fixedMessage: false }) });
      throw error;
    }));
  }, [current, slots, readOnly, season]);

  return { grade: current.grade, slots: current.slots, onSetMinApprovalGrade, onSetSlots };
}
