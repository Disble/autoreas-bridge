import { useCallback } from 'react';
import type { AnimeDesktopActionsSource } from '../../../shared/contracts/anime-editor-source.types';
import { useBridgeMutation } from '../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { SEASON_FOLDER_COPIED_TOAST, SEASON_PAGE_COPIED_TOAST } from './season-desktop-actions.constants';
import { showDesktopActionToast, toDesktopActionFailureToast, toDesktopActionToast } from './season-desktop-actions.helpers';
import type { SeasonDesktopAction, SeasonDesktopActionRequest, SeasonDesktopActions } from './season-desktop-actions.types';

/**
 * Wires the four season card actions that leave the app — open or copy an
 * anime's page, open or copy its folder — through the anime module's desktop
 * port. A rejected action (the anime module starting or failed included) or a
 * non-ok result shows a danger toast with the bridge's message, a copy that
 * worked shows its success toast, and an open that worked stays silent.
 *
 * @param source The anime module's desktop-actions port.
 * @returns The four card callbacks, stable per source.
 */
export function useSeasonDesktopActions(source: AnimeDesktopActionsSource): SeasonDesktopActions {
  // 4. Queries/Mutations
  const { mutateAsync: runAction } = useBridgeMutation({
    mutationFn: (request: SeasonDesktopActionRequest) => request.action(request.animeId),
  });

  // 6. Callbacks (useCallback calling pure helpers)
  const run = useCallback((action: SeasonDesktopAction, animeId: string, successToast?: string) => {
    void runAction({ action, animeId }).then(
      (result) => showDesktopActionToast(toDesktopActionToast(result, successToast)),
      (error: unknown) => showDesktopActionToast(toDesktopActionFailureToast(error)),
    );
  }, [runAction]);
  const onOpenPage = useCallback((animeId: string) => run(source.openAnimePage, animeId), [run, source.openAnimePage]);
  const onCopyPage = useCallback((animeId: string) => run(source.copyAnimePage, animeId, SEASON_PAGE_COPIED_TOAST), [run, source.copyAnimePage]);
  const onOpenFolder = useCallback((animeId: string) => run(source.openAnimeFolder, animeId), [run, source.openAnimeFolder]);
  const onCopyFolder = useCallback((animeId: string) => run(source.copyAnimeFolder, animeId, SEASON_FOLDER_COPIED_TOAST), [run, source.copyAnimeFolder]);

  return { onOpenPage, onCopyPage, onOpenFolder, onCopyFolder };
}
