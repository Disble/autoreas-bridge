import { toast } from '@heroui/react';
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { BRIDGE_EPISODES_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
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
 * `isSaving`, run one `useBridgeMutation` (deactivate on the anime module, restore
 * and repeat on the episodes module), and toast the resolved result message.
 * A rejected restore or repeat toasts its failure message, or the action's
 * not-applied copy when the failure carries none.
 *
 * Split out of `useAnimeEditorRecord` so that hook stays under the
 * complexity ceiling: merging the MyAnimeList autofill work with the Repeat
 * work put sixteen hooks in one function, which `fallow audit` blocks.
 */
export function useAnimeEditorLifecycleActions(
  sources: Pick<UseAnimeEditorRecordOptions, 'source' | 'editorSource'>,
  selectedRecord: AnimeEditorRecordState['selectedRecord'],
  setState: Dispatch<SetStateAction<AnimeEditorRecordState>>,
  loadRecord: (animeId: string) => Promise<void>,
) {
  // 1. Refs
  const { editorSource } = sources;

  // 4. Queries/Mutations
  const deactivateMutation = useBridgeMutation({
    mutationFn: (record: { readonly animeId: string; readonly modifiedAt: number }) => editorSource.deactivateAnime(record.animeId, record.modifiedAt),
  });
  const deactivateAnime = deactivateMutation.mutateAsync;
  const restoreMutation = useBridgeMutation({
    mutationFn: (record: { readonly animeId: string; readonly modifiedAt: number }) => BRIDGE_EPISODES_SOURCE.restoreAnime(record.animeId, record.modifiedAt),
  });
  const restoreAnime = restoreMutation.mutateAsync;
  const repeatMutation = useBridgeMutation({
    mutationFn: (record: { readonly animeId: string; readonly modifiedAt: number }) => BRIDGE_EPISODES_SOURCE.repeatAnime(record.animeId, record.modifiedAt),
  });
  const repeatAnime = repeatMutation.mutateAsync;

  // 6. Callbacks
  const onDeactivate = useCallback(async () => {
    if (selectedRecord === undefined) return undefined;
    setState((current) => ({ ...current, isSaving: true }));
    try {
      const result = await raceAnimeEditorCall(deactivateAnime(selectedRecord));
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
  }, [deactivateAnime, selectedRecord, setState]);

  const onRestore = useCallback(async () => {
    if (selectedRecord === undefined) return undefined;
    const animeId = selectedRecord.animeId;
    setState((current) => ({ ...current, isSaving: true }));
    try {
      const result = await raceAnimeEditorCall(restoreAnime(selectedRecord));
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
      const message = resolveAnimeEditorFeedbackMessage(error instanceof Error ? error : {}, 'Restore anime was not applied.');
      toast.danger(message);
      return { status: 'error' as const, message };
    } finally {
      setState((current) => ({ ...current, isSaving: false }));
    }
  }, [restoreAnime, selectedRecord, loadRecord, setState]);

  const onRepeat = useCallback(async () => {
    if (selectedRecord === undefined) return undefined;
    const animeId = selectedRecord.animeId;
    setState((current) => ({ ...current, isSaving: true }));
    try {
      const result = await raceAnimeEditorCall(repeatAnime(selectedRecord));
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
      const message = resolveAnimeEditorFeedbackMessage(error instanceof Error ? error : {}, 'Repeat anime was not applied.');
      toast.danger(message);
      return { status: 'error' as const, message };
    } finally {
      setState((current) => ({ ...current, isSaving: false }));
    }
  }, [repeatAnime, selectedRecord, loadRecord, setState]);

  // 8. Return
  return { onDeactivate, onRestore, onRepeat };
}
