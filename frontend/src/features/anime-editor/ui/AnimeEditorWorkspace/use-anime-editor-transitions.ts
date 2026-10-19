import { useNavigate, useParams } from 'react-router';
import { useCallback, useEffect, useRef } from 'react';
import type { AnimeEditorSaveResult, ApplyAnimeScheduleDraftEntry } from '../../../../shared/contracts/anime.types';
import { saveDirtyCards, toEpisodesGuardResult } from './anime-editor-guard.helpers';
import { isIntentionalEditorOutcome } from './anime-editor-workspace.helpers';
import type { AnimeEditorPendingAction, UseAnimeEditorTransitionsOptions } from './anime-editor-workspace.types';
import { useAnimeEditorGuard } from './use-anime-editor-guard';

/** Orchestrates guarded selection, route, save, deactivate, and schedule transitions. */
export function useAnimeEditorTransitions(options: Readonly<UseAnimeEditorTransitionsOptions>) {
  // 1. Refs
  const previousParamIdRef = useRef<string | undefined>(undefined);
  // `options` is a fresh literal on every workspace render, so each callback
  // depends on the fields it reads: memoizing on `options` itself would hand
  // every panel a new callback per render and defeat their `memo`.
  const {
    selectedAnimeId, loadItems, setSelectedAnimeId, loadRecord, saveRecord, deactivateRecord, restoreRecord, repeatRecord,
    discardRecord, discardEpisodes, applySchedule, openSchedule, reloadSchedule, saveEpisodes, isDirty, isRecordDirty, isEpisodesDirty, isGuardSaveBlocked,
  } = options;

  // 2. State

  // 3. Context/3rd Party Hooks
  const navigate = useNavigate();
  const params = useParams();
  const guard = useAnimeEditorGuard({ isDirty });
  const { requestAction, continueWithDiscard, continueWithSave } = guard;

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const onSave = useCallback(async () => {
    const result = await saveRecord();
    if (result !== undefined && isIntentionalEditorOutcome(result)) {
      await loadItems();
      // A saved anime may have moved on the board, so the Schedule card's week strip reads it again.
      await reloadSchedule();
    }
    return result;
  }, [loadItems, reloadSchedule, saveRecord]);
  const onDeactivate = useCallback(async () => {
    const result = await deactivateRecord();
    if (result !== undefined && isIntentionalEditorOutcome(result)) await loadItems();
  }, [deactivateRecord, loadItems]);
  const onRestore = useCallback(async () => {
    const result = await restoreRecord();
    // Restore is a lifecycle command (EpisodeCommandResult); "ok" means the
    // anime is active again, so refresh the rail to re-home it under "Watching now".
    if (result?.status === 'ok') await loadItems();
  }, [loadItems, restoreRecord]);
  const onRepeat = useCallback(async () => {
    const result = await repeatRecord();
    // Repeat is a lifecycle command (EpisodeCommandResult); "ok" means a new
    // watch cycle started, so refresh the rail to reflect the reset watch count.
    if (result?.status === 'ok') await loadItems();
  }, [loadItems, repeatRecord]);
  const onApplySchedule = useCallback(async (entries: readonly ApplyAnimeScheduleDraftEntry[]) => {
    const result = await applySchedule(entries);
    if (result !== undefined && (result.outcome === 'applied' || result.outcome === 'no_op')) {
      await loadItems();
      if (selectedAnimeId !== undefined) await loadRecord(selectedAnimeId);
    }
  }, [applySchedule, loadItems, loadRecord, selectedAnimeId]);
  const executePendingAction = useCallback(async (action: Exclude<AnimeEditorPendingAction, undefined>) => {
    if (action.type === 'select') {
      setSelectedAnimeId(action.animeId);
      await navigate(`/editor/${action.animeId}`);
    } else if (action.type === 'schedule') {
      await openSchedule();
    } else if (action.type === 'navigate') {
      await navigate(action.path);
    } else {
      await navigate(-1);
    }
  }, [navigate, openSchedule, setSelectedAnimeId]);
  const onSelectAnime = useCallback((animeId: string) => {
    if (animeId === selectedAnimeId) return;
    const action = { type: 'select' as const, animeId };
    if (requestAction(action)) void executePendingAction(action);
  }, [executePendingAction, requestAction, selectedAnimeId]);
  const onOpenSchedule = useCallback(() => {
    const action = { type: 'schedule' as const };
    return requestAction(action) ? executePendingAction(action) : Promise.resolve();
  }, [executePendingAction, requestAction]);
  /** The guard's "Discard changes" drops both drafts, then continues. */
  const onDiscardAndContinue = useCallback(() => continueWithDiscard(() => {
    discardRecord();
    discardEpisodes();
  }, executePendingAction), [continueWithDiscard, discardEpisodes, discardRecord, executePendingAction]);
  /** "Save and continue": each dirty card saves on its own, and the action continues only if all saved (S15). */
  const onSaveAndContinue = useCallback(() => isGuardSaveBlocked ? Promise.resolve() : continueWithSave((): Promise<AnimeEditorSaveResult | undefined> => saveDirtyCards([
    { isDirty: isRecordDirty, save: onSave },
    { isDirty: isEpisodesDirty, save: async () => toEpisodesGuardResult(await saveEpisodes()) },
  ]), executePendingAction), [continueWithSave, executePendingAction, isEpisodesDirty, isGuardSaveBlocked, isRecordDirty, onSave, saveEpisodes]);

  // 7. Effects
  // Sync selection ONLY from real URL changes (deep-link / browser back), never
  // from the intermediate render where a click has advanced selectedAnimeId but
  // navigate() has not yet propagated params.id — that stale-param render would
  // otherwise revert the just-picked anime and lock selection after the first.
  useEffect(() => {
    const paramChanged = params.id !== previousParamIdRef.current;
    previousParamIdRef.current = params.id;
    if (!paramChanged || params.id === undefined || params.id === selectedAnimeId) return;
    const action = { type: 'select' as const, animeId: params.id };
    if (requestAction(action)) void executePendingAction(action);
  }, [executePendingAction, requestAction, selectedAnimeId, params.id]);

  return { ...guard, onSave, onDeactivate, onRestore, onRepeat, onApplySchedule, onSelectAnime, onOpenSchedule, onDiscardAndContinue, onSaveAndContinue };
}
