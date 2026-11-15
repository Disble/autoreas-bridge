import { useCallback } from 'react';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { toEpisodeCommandFailureMessage } from './episode-schedule-panel.helpers';
import type { EpisodeRowWrite, UseEpisodeProgressCommandsOptions } from './episode-schedule-panel.types';

/**
 * Wires the two row writes — nudging watched episodes and setting an anime's
 * state — onto one outcome contract: each runs through `useBridgeMutation`, a
 * rejected write becomes panel feedback and changes nothing else; an accepted
 * one re-reads the schedule and the day counts, because either write can move
 * a row off the selected day.
 *
 * Split out of `useEpisodeSchedulePanel`, which also owns the schedule request,
 * the day counts, the covers and the desktop actions. These two share one shape
 * and are the only writes in the panel.
 */
export function useEpisodeProgressCommands(options: Readonly<UseEpisodeProgressCommandsOptions>) {
  // 1. Refs
  const { onCommitted, onError, source } = options;

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const adjustMutation = useBridgeMutation({
    mutationFn: (write: EpisodeRowWrite) => source.adjustWatchedEpisodes(write.animeID, write.value, write.base),
  });
  const stateMutation = useBridgeMutation({
    mutationFn: (write: EpisodeRowWrite) => source.setAnimeState(write.animeID, write.value, write.base),
  });
  const runAdjust = adjustMutation.mutateAsync;
  const runSetState = stateMutation.mutateAsync;

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const adjustWatchedEpisodes = useCallback(
    async (animeID: string, delta: number, base: number) => {
      onError('');
      try {
        await runAdjust({ animeID, value: delta, base });
      } catch (error) {
        onError(toEpisodeCommandFailureMessage(error, 'Could not update episode progress.'));
        return;
      }
      onCommitted();
    },
    [onCommitted, onError, runAdjust],
  );

  const setAnimeState = useCallback(
    async (animeID: string, estado: number, base: number) => {
      onError('');
      try {
        await runSetState({ animeID, value: estado, base });
      } catch (error) {
        onError(toEpisodeCommandFailureMessage(error, 'Could not update anime state.'));
        return;
      }
      onCommitted();
    },
    [onCommitted, onError, runSetState],
  );

  // 7. Effects

  return { adjustWatchedEpisodes, setAnimeState };
}
