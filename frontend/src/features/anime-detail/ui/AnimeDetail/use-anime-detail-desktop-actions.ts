import { useCallback } from 'react';
import { toast } from '@heroui/react';
import { BRIDGE_ANIME_DESKTOP_ACTIONS_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { ANIME_DETAIL_COPY_FOLDER_FEEDBACK, ANIME_DETAIL_OPEN_PAGE_FEEDBACK } from './anime-detail.constants';
import { runAnimeDetailDesktopAction } from './anime-detail.helpers';
import type {
  AnimeDetailDesktopAction,
  AnimeDetailDesktopActionFeedback,
  AnimeDetailDesktopActions,
  AnimeDetailDesktopActionSource,
} from './anime-detail.types';

/**
 * The Detail actions that leave the app, run through the anime module like
 * every other screen's: copy the folder path (confirmed by a toast) and open
 * the page in the system default browser (silent on success, since the browser
 * is its own confirmation). Failures, a starting or failed module included,
 * raise a danger toast through the global HeroUI toast queue. Split out of
 * `useAnimeDetail`, which owns the detail request, the cover and the navigation.
 *
 * @param animeId The anime the actions run for.
 * @param source The anime module's desktop actions.
 * @returns The callbacks the Folder copy button and the Page link call.
 */
export function useAnimeDetailDesktopActions(
  animeId: string,
  source: AnimeDetailDesktopActionSource = BRIDGE_ANIME_DESKTOP_ACTIONS_SOURCE,
): AnimeDetailDesktopActions {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const copyFolderMutation = useBridgeMutation({ mutationFn: (id: string) => source.copyAnimeFolder(id) });
  const openPageMutation = useBridgeMutation({ mutationFn: (id: string) => source.openAnimePage(id) });
  const copyAnimeFolder = copyFolderMutation.mutateAsync;
  const openAnimePage = openPageMutation.mutateAsync;

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const runDesktopAction = useCallback(async (action: AnimeDetailDesktopAction, feedback: AnimeDetailDesktopActionFeedback) => {
    const result = await runAnimeDetailDesktopAction(action, animeId, feedback);
    if (result !== undefined) {
      toast[result.status](result.message);
    }
  }, [animeId]);
  const onCopyFolder = useCallback(
    () => runDesktopAction(copyAnimeFolder, ANIME_DETAIL_COPY_FOLDER_FEEDBACK),
    [runDesktopAction, copyAnimeFolder],
  );
  const onOpenPage = useCallback(
    () => runDesktopAction(openAnimePage, ANIME_DETAIL_OPEN_PAGE_FEEDBACK),
    [runDesktopAction, openAnimePage],
  );

  // 7. Effects

  return { onCopyFolder, onOpenPage };
}
