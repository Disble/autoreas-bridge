import { useCallback } from 'react';
import { toast } from '@heroui/react';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import type { EpisodeCommandResult, EpisodeScheduleSource } from './episode-schedule-panel.types';

/**
 * Wires the four row actions that leave the app — open or copy an anime's page,
 * open or copy its folder — onto one outcome: a failure (a rejected action,
 * the anime module starting or failed included, or a non-ok result) becomes
 * panel feedback, a copy that worked becomes a toast, and an open that worked
 * stays silent because the thing it opened is its own confirmation.
 *
 * Split out of `useEpisodeSchedulePanel`, which also owns the schedule request,
 * the day counts, the covers and the push subscription. These four share one
 * mutation and touch nothing else in that hook.
 *
 * @param source The schedule port the desktop commands are sent through.
 * @param onError Called with the message a failed command should surface.
 * @returns The four row callbacks, stable per source.
 */
export function useEpisodeDesktopActions(source: EpisodeScheduleSource, onError: (message: string) => void) {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const actionMutation = useBridgeMutation({
    mutationFn: (request: { readonly action: (animeID: string) => Promise<EpisodeCommandResult>; readonly animeID: string }) => request.action(request.animeID),
  });
  const runAction = actionMutation.mutateAsync;

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const runDesktopAction = useCallback(async (action: (animeID: string) => Promise<EpisodeCommandResult>, animeID: string, successToast?: string) => {
    onError('');
    let result: EpisodeCommandResult;
    try {
      result = await runAction({ action, animeID });
    } catch (error) {
      onError(error instanceof Error && error.message !== '' ? error.message : 'Could not run anime desktop action.');
      return;
    }
    if (result.status !== 'ok') {
      onError(result.message ?? 'Could not run anime desktop action.');
      return;
    }
    if (successToast !== undefined) {
      toast.success(successToast);
    }
  }, [onError, runAction]);

  const openAnimePage = useCallback((animeID: string) => runDesktopAction(source.openAnimePage, animeID), [runDesktopAction, source.openAnimePage]);
  const copyAnimePage = useCallback((animeID: string) => runDesktopAction(source.copyAnimePage, animeID, 'Page URL copied to clipboard'), [runDesktopAction, source.copyAnimePage]);
  const openAnimeFolder = useCallback((animeID: string) => runDesktopAction(source.openAnimeFolder, animeID), [runDesktopAction, source.openAnimeFolder]);
  const copyAnimeFolder = useCallback((animeID: string) => runDesktopAction(source.copyAnimeFolder, animeID, 'Folder path copied to clipboard'), [runDesktopAction, source.copyAnimeFolder]);

  // 7. Effects

  return { openAnimePage, copyAnimePage, openAnimeFolder, copyAnimeFolder };
}
