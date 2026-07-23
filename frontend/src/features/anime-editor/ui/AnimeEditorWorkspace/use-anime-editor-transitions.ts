import { useNavigate, useParams } from 'react-router';
import { useCallback, useEffect, useRef } from 'react';
import type { ApplyAnimeScheduleDraftEntry } from '../../../../shared/contracts/anime.types';
import { isIntentionalEditorOutcome } from './anime-editor-workspace.helpers';
import type { AnimeEditorPendingAction, UseAnimeEditorTransitionsOptions } from './anime-editor-workspace.types';
import { useAnimeEditorGuard } from './use-anime-editor-guard';

/** Orchestrates guarded selection, route, save, deactivate, and schedule transitions. */
export function useAnimeEditorTransitions(options: Readonly<UseAnimeEditorTransitionsOptions>) {
  // 1. Refs
  const previousParamIdRef = useRef<string | undefined>(undefined);

  // 2. State

  // 3. Context/3rd Party Hooks
  const navigate = useNavigate();
  const params = useParams();
  const guard = useAnimeEditorGuard({ isDirty: options.isDirty });

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const onSave = useCallback(async () => {
    const result = await options.saveRecord();
    if (result !== undefined && isIntentionalEditorOutcome(result)) await options.loadItems();
    return result;
  }, [options]);
  const onDeactivate = useCallback(async () => {
    const result = await options.deactivateRecord();
    if (result !== undefined && isIntentionalEditorOutcome(result)) await options.loadItems();
  }, [options]);
  const onActivate = useCallback(async () => {
    const result = await options.activateRecord();
    // Restore is a lifecycle command (EpisodeCommandResult); "ok" means the
    // anime is active again, so refresh the rail to re-home it under "Watching now".
    if (result !== undefined && result.status === 'ok') await options.loadItems();
  }, [options]);
  const onApplySchedule = useCallback(async (entries: readonly ApplyAnimeScheduleDraftEntry[]) => {
    const result = await options.applySchedule(entries);
    if (result !== undefined && (result.outcome === 'applied' || result.outcome === 'no_op')) {
      await options.loadItems();
      if (options.selectedAnimeId !== undefined) await options.loadRecord(options.selectedAnimeId);
    }
  }, [options]);
  const executePendingAction = useCallback(async (action: Exclude<AnimeEditorPendingAction, undefined>) => {
    if (action.type === 'select') {
      options.setSelectedAnimeId(action.animeId);
      await navigate(`/editor/${action.animeId}`);
    } else if (action.type === 'schedule') {
      await options.openSchedule();
    } else if (action.type === 'navigate') {
      await navigate(action.path);
    } else {
      await navigate(-1);
    }
  }, [navigate, options]);
  const onSelectAnime = useCallback((animeId: string) => {
    if (animeId === options.selectedAnimeId) return;
    const action = { type: 'select' as const, animeId };
    if (guard.requestAction(action)) void executePendingAction(action);
  }, [executePendingAction, guard, options.selectedAnimeId]);
  const onOpenSchedule = useCallback(() => {
    const action = { type: 'schedule' as const };
    return guard.requestAction(action) ? executePendingAction(action) : Promise.resolve();
  }, [executePendingAction, guard]);
  const onDiscardAndContinue = useCallback(() => guard.continueWithDiscard(options.discardRecord, executePendingAction), [executePendingAction, guard, options.discardRecord]);
  const onSaveAndContinue = useCallback(() => guard.continueWithSave(onSave, executePendingAction), [executePendingAction, guard, onSave]);

  // 7. Effects
  // Sync selection ONLY from real URL changes (deep-link / browser back), never
  // from the intermediate render where a click has advanced selectedAnimeId but
  // navigate() has not yet propagated params.id — that stale-param render would
  // otherwise revert the just-picked anime and lock selection after the first.
  useEffect(() => {
    const paramChanged = params.id !== previousParamIdRef.current;
    previousParamIdRef.current = params.id;
    if (!paramChanged || params.id === undefined || params.id === options.selectedAnimeId) return;
    const action = { type: 'select' as const, animeId: params.id };
    if (guard.requestAction(action)) void executePendingAction(action);
  }, [executePendingAction, guard, options.selectedAnimeId, params.id]);

  return { ...guard, onSave, onDeactivate, onActivate, onApplySchedule, onSelectAnime, onOpenSchedule, onDiscardAndContinue, onSaveAndContinue };
}
