import { useCallback } from 'react';
import type { UseEpisodeProgressCommandsOptions } from './episode-schedule-panel.types';

/**
 * Wires the two row writes — nudging watched episodes and setting an anime's
 * state — onto one outcome contract: a rejected write becomes panel feedback
 * and changes nothing else; an accepted one re-reads the schedule and the day
 * counts, because either write can move a row off the selected day.
 *
 * Split out of `useEpisodeSchedulePanel`, which also owns the schedule request,
 * the day counts, the covers, the desktop actions and the push subscription.
 * These two share one shape and are the only writes in the panel.
 */
export function useEpisodeProgressCommands(options: Readonly<UseEpisodeProgressCommandsOptions>) {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const { onCommitted, onError, source } = options;

  const adjustWatchedEpisodes = useCallback(
    async (animeID: string, delta: number, base: number) => {
      onError('');
      const result = await source.adjustWatchedEpisodes(animeID, delta, base);
      if (result.status !== 'ok') {
        onError(result.message ?? 'Could not update episode progress.');
        return;
      }
      onCommitted();
    },
    [onCommitted, onError, source],
  );

  const setAnimeState = useCallback(
    async (animeID: string, estado: number, base: number) => {
      onError('');
      const result = await source.setAnimeState(animeID, estado, base);
      if (result.status !== 'ok') {
        onError(result.message ?? 'Could not update anime state.');
        return;
      }
      onCommitted();
    },
    [onCommitted, onError, source],
  );

  // 7. Effects

  return { adjustWatchedEpisodes, setAnimeState };
}
