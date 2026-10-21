import { useCallback } from 'react';
import { toast } from '@heroui/react';
import { ANIME_DETAIL_COPY_FOLDER_FEEDBACK, ANIME_DETAIL_OPEN_PAGE_FEEDBACK } from './anime-detail.constants';
import { runAnimeDetailDesktopAction } from './anime-detail.helpers';
import type {
  AnimeDetailDesktopAction,
  AnimeDetailDesktopActionFeedback,
  AnimeDetailDesktopActions,
  AnimeDetailDesktopActionSource,
} from './anime-detail.types';

/**
 * The Detail actions that leave the app, run through the bridge like every
 * other screen's: copy the folder path (confirmed by a toast) and open the
 * page in the system default browser (silent on success, since the browser is
 * its own confirmation). Failures raise a danger toast through the global
 * HeroUI toast queue. Split out of `useAnimeDetail`, which owns the detail
 * request, the cover and the navigation.
 *
 * @param animeId The anime the actions run for.
 * @param source The optional runtime bindings; an absent one fails closed.
 * @returns The callbacks the Folder copy button and the Page link call.
 */
export function useAnimeDetailDesktopActions(animeId: string, source: AnimeDetailDesktopActionSource): AnimeDetailDesktopActions {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const runDesktopAction = useCallback(async (action: AnimeDetailDesktopAction | undefined, feedback: AnimeDetailDesktopActionFeedback) => {
    const result = await runAnimeDetailDesktopAction(action, animeId, feedback);
    if (result !== undefined) {
      toast[result.status](result.message);
    }
  }, [animeId]);
  const onCopyFolder = useCallback(
    () => runDesktopAction(source.copyAnimeFolder, ANIME_DETAIL_COPY_FOLDER_FEEDBACK),
    [runDesktopAction, source.copyAnimeFolder],
  );
  const onOpenPage = useCallback(
    () => runDesktopAction(source.openAnimePage, ANIME_DETAIL_OPEN_PAGE_FEEDBACK),
    [runDesktopAction, source.openAnimePage],
  );

  // 7. Effects

  return { onCopyFolder, onOpenPage };
}
