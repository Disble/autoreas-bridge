import { useCallback, useMemo, useState } from 'react';
import type { AnimeDetail } from '../../../../shared/contracts/anime.types';
import {
  isAnimeDetailMutationRouteActive,
  resolveAnimeDetailMutation,
  toAnimeDetailCommandFailureMessage,
  toAnimeDetailConfirmation,
  withAnimeDetailRefreshFailure,
} from './anime-detail.helpers';
import type {
  AnimeDetailAction,
  AnimeDetailMutationController,
  AnimeDetailMutationHookProps,
  AnimeDetailMutationResolution,
  AnimeDetailMutationState,
} from './anime-detail.types';
import { useAnimeDetailMutationVisit } from './use-anime-detail-mutation-visit';

/** Owns confirmation, execution, outcome feedback, and Detail-only refresh for Repeat and Restore. */
export function useAnimeDetailMutation(
  props: Readonly<AnimeDetailMutationHookProps>,
): AnimeDetailMutationController {
  const { animeId, commands, detail, refreshDetail: readDetailAgain } = props;

  // 1. Refs

  // 2. State
  const [mutationState, setMutationState] = useState<AnimeDetailMutationState>({
    animeId,
    routeGeneration: 0,
    confirmationAction: undefined,
    feedback: undefined,
    isMutating: false,
  });

  // 3. Context/3rd Party Hooks
  const { isActive, routeGeneration } = useAnimeDetailMutationVisit(animeId);

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const isCurrentRouteState = isAnimeDetailMutationRouteActive(
    animeId,
    routeGeneration,
    mutationState.animeId,
    mutationState.routeGeneration,
  );
  const confirmationAction = isCurrentRouteState
    ? mutationState.confirmationAction
    : undefined;
  const feedback = isCurrentRouteState ? mutationState.feedback : undefined;
  const isMutating = isCurrentRouteState && mutationState.isMutating;
  const confirmation = useMemo(
    () => confirmationAction === undefined || detail === undefined
      ? undefined
      : toAnimeDetailConfirmation(confirmationAction, detail.name),
    [confirmationAction, detail],
  );

  // 6. Callbacks (useCallback calling pure helpers)
  const onRequestRepeat = useCallback(() => {
    if (detail !== undefined && detail.status > 0) {
      setMutationState({
        animeId,
        routeGeneration,
        confirmationAction: 'repeat',
        feedback: undefined,
        isMutating: false,
      });
    }
  }, [animeId, detail, routeGeneration]);
  const onRequestRestore = useCallback(() => {
    if (detail?.active === 0) {
      setMutationState({
        animeId,
        routeGeneration,
        confirmationAction: 'restore',
        feedback: undefined,
        isMutating: false,
      });
    }
  }, [animeId, detail, routeGeneration]);
  const onCancelAction = useCallback(() => {
    if (!isMutating) {
      setMutationState((previous) => ({ ...previous, confirmationAction: undefined }));
    }
  }, [isMutating]);
  const onConfirmationOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      onCancelAction();
    }
  }, [onCancelAction]);
  const executeMutation = useCallback(async (
    action: AnimeDetailAction,
    currentDetail: AnimeDetail,
  ): Promise<AnimeDetailMutationResolution> => {
    const binding = action === 'repeat' ? commands.repeatAnime : commands.restoreAnime;
    try {
      return resolveAnimeDetailMutation(
        action,
        await binding(currentDetail.id, currentDetail.modified_at),
      );
    } catch (error) {
      return resolveAnimeDetailMutation(action, {
        status: 'error',
        message: toAnimeDetailCommandFailureMessage(error),
        modifiedAt: currentDetail.modified_at,
      });
    }
  }, [commands]);
  const refreshDetail = useCallback(async (
    animeId: string,
    actionRouteGeneration: number,
    resolution: AnimeDetailMutationResolution,
  ) => {
    if (!resolution.shouldRefetch) {
      return;
    }

    const isRefreshed = await readDetailAgain();
    if (!isRefreshed && isActive(animeId, actionRouteGeneration)) {
      setMutationState((previous) => ({
        ...previous,
        feedback: withAnimeDetailRefreshFailure(resolution).feedback,
      }));
    }
  }, [isActive, readDetailAgain]);
  const onConfirmAction = useCallback(async () => {
    if (confirmationAction === undefined || detail === undefined || isMutating) {
      return;
    }

    const actionAnimeId = animeId;
    const actionRouteGeneration = routeGeneration;
    setMutationState((previous) => ({ ...previous, feedback: undefined, isMutating: true }));

    try {
      const resolution = await executeMutation(confirmationAction, detail);
      if (isActive(actionAnimeId, actionRouteGeneration)) {
        setMutationState((previous) => ({
          ...previous,
          confirmationAction: undefined,
          feedback: resolution.feedback,
        }));
        await refreshDetail(actionAnimeId, actionRouteGeneration, resolution);
      }
    } finally {
      if (isActive(actionAnimeId, actionRouteGeneration)) {
        setMutationState((previous) => ({ ...previous, isMutating: false }));
      }
    }
  }, [animeId, confirmationAction, detail, executeMutation, isActive, isMutating, refreshDetail, routeGeneration]);

  // 7. Effects

  return {
    confirmation,
    feedback,
    isMutating,
    onRequestRepeat,
    onRequestRestore,
    onCancelAction,
    onConfirmationOpenChange,
    onConfirmAction,
  };
}
