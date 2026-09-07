import { useCallback } from 'react';
import { toast } from '@heroui/react';
import type { EpisodeCommandResult, EpisodeScheduleSource } from './episode-schedule-panel.types';

/**
 * Wires the four row actions that leave the app — open or copy an anime's page,
 * open or copy its folder — onto one result contract: a failure becomes panel
 * feedback, a copy that worked becomes a toast, and an open that worked stays
 * silent because the thing it opened is its own confirmation.
 *
 * Split out of `useEpisodeSchedulePanel`, which also owns the schedule request,
 * the day counts, the covers and the push subscription. These four share one
 * helper and touch nothing else in that hook.
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

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const runDesktopAction = useCallback(async (action: (animeID: string) => Promise<EpisodeCommandResult>, animeID: string, successToast?: string) => {
    onError('');
    const result = await action(animeID);
    if (result.status !== 'ok') {
      onError(result.message ?? 'Could not run anime desktop action.');
      return;
    }
    if (successToast !== undefined) {
      toast.success(successToast);
    }
  }, [onError]);

  const openAnimePage = useCallback((animeID: string) => runDesktopAction(source.openAnimePage, animeID), [runDesktopAction, source.openAnimePage]);
  const copyAnimePage = useCallback((animeID: string) => runDesktopAction(source.copyAnimePage, animeID, 'Page URL copied to clipboard'), [runDesktopAction, source.copyAnimePage]);
  const openAnimeFolder = useCallback((animeID: string) => runDesktopAction(source.openAnimeFolder, animeID), [runDesktopAction, source.openAnimeFolder]);
  const copyAnimeFolder = useCallback((animeID: string) => runDesktopAction(source.copyAnimeFolder, animeID, 'Folder path copied to clipboard'), [runDesktopAction, source.copyAnimeFolder]);

  // 7. Effects

  return { openAnimePage, copyAnimePage, openAnimeFolder, copyAnimeFolder };
}
