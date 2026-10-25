import { toast } from '@heroui/react';
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  createAnimeEditorDraft,
  isIntentionalEditorOutcome,
  raceAnimeEditorCall,
  resolveAnimeEditorFeedbackMessage,
  toAnimeEditorToastKind,
  toEditorErrorMessage,
} from './anime-editor-workspace.helpers';
import type { AnimeEditorRecordState, UseAnimeEditorRecordOptions } from './anime-editor-workspace.types';

/**
 * The three record mutations that change an anime's LIFECYCLE rather than its
 * fields: deactivate, restore, and repeat. They are grouped because the
 * workspace already models them as one concept -- a single
 * `AnimeEditorLifecycleAction` drives one confirmation dialog for all three --
 * and because each one shares the same shape: guard on a selected record, flip
 * `isSaving`, call one runtime binding, and toast the resolved result message.
 *
 * Split out of `useAnimeEditorRecord` so that hook stays under the
 * complexity ceiling: merging the MyAnimeList autofill work with the Repeat
 * work put sixteen hooks in one function, which `fallow audit` blocks.
 */
export function useAnimeEditorLifecycleActions(
  source: UseAnimeEditorRecordOptions['source'],
  selectedRecord: AnimeEditorRecordState['selectedRecord'],
  setState: Dispatch<SetStateAction<AnimeEditorRecordState>>,
  loadRecord: (animeId: string) => Promise<void>,
) {
  // 6. Callbacks
  const onDeactivate = useCallback(async () => {
    if (selectedRecord === undefined) return undefined;
    setState((current) => ({ ...current, isSaving: true }));
    try {
      const result = await raceAnimeEditorCall(source.deactivateAnime(selectedRecord.animeId, selectedRecord.modifiedAt));
      const intentional = isIntentionalEditorOutcome(result);
      setState((current) => ({
        ...current,
        selectedRecord: result.record ?? current.selectedRecord,
        draft: intentional ? createAnimeEditorDraft(result.record) : current.draft,
        retainsAttemptedDraft: !intentional,
      }));
      toast[toAnimeEditorToastKind(result.outcome)](resolveAnimeEditorFeedbackMessage(result, 'Deactivate anime was not applied.'));
      return result;
    } catch (error) {
      const message = toEditorErrorMessage(error);
      setState((current) => ({ ...current, retainsAttemptedDraft: true }));
      toast.danger(message);
      return { outcome: 'error' as const, message };
    } finally {
      setState((current) => ({ ...current, isSaving: false }));
    }
  }, [source, selectedRecord, setState]);

  const onRestore = useCallback(async () => {
    if (selectedRecord === undefined) return undefined;
    const animeId = selectedRecord.animeId;
    setState((current) => ({ ...current, isSaving: true }));
    try {
      const result = await raceAnimeEditorCall(source.restoreAnime(animeId, selectedRecord.modifiedAt));
      if (result.status === 'ok') {
        // Authority changed (active flips true); reload the record so the form
        // and the Deactivate/Restore button reflect the restored lifecycle.
        await loadRecord(animeId);
        toast.success(resolveAnimeEditorFeedbackMessage(result, 'Anime restored.'));
      } else {
        toast.danger(resolveAnimeEditorFeedbackMessage(result, 'Restore anime was not applied.'));
      }
      return result;
    } catch (error) {
      const message = toEditorErrorMessage(error);
      toast.danger(message);
      return { status: 'error' as const, message };
    } finally {
      setState((current) => ({ ...current, isSaving: false }));
    }
  }, [source, selectedRecord, loadRecord, setState]);

  const onRepeat = useCallback(async () => {
    if (selectedRecord === undefined) return undefined;
    const animeId = selectedRecord.animeId;
    setState((current) => ({ ...current, isSaving: true }));
    try {
      const result = await raceAnimeEditorCall(source.repeatAnime(animeId, selectedRecord.modifiedAt));
      if (result.status === 'ok') {
        // Authority changed (progress resets to 0, status/active flip, a new
        // cycle starts); reload the record so the form and the Repeat/Restore
        // buttons reflect the reset lifecycle instead of stale watched state.
        await loadRecord(animeId);
        toast.success(resolveAnimeEditorFeedbackMessage(result, 'Anime repeated.'));
      } else {
        toast.danger(resolveAnimeEditorFeedbackMessage(result, 'Repeat anime was not applied.'));
      }
      return result;
    } catch (error) {
      const message = toEditorErrorMessage(error);
      toast.danger(message);
      return { status: 'error' as const, message };
    } finally {
      setState((current) => ({ ...current, isSaving: false }));
    }
  }, [source, selectedRecord, loadRecord, setState]);

  // 8. Return
  return { onDeactivate, onRestore, onRepeat };
}
