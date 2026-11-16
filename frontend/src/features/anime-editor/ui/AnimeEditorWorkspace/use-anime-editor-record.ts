import { toast } from '@heroui/react';
import { useCallback, useMemo, useState } from 'react';
import type { AnimeEditorSaveResult, SaveAnimeEditorCommand } from '../../../../shared/contracts/anime.types';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { toShownRecordLoadError } from './anime-editor-record.helpers';
import { ANIME_EDITOR_DEFAULT_DRAFT } from './anime-editor-workspace.constants';
import { createAnimeEditorDraft, createAnimeEditorSaveCommand, hasAnimeEditorChanges, isIntentionalEditorOutcome, raceAnimeEditorCall, resolveAnimeEditorFeedbackMessage, toAnimeEditorToastKind, toEditorErrorMessage, validateAnimeEditorDraft } from './anime-editor-workspace.helpers';
import type { AnimeEditorDraft, AnimeEditorRecordState, AnimeEditorSettledRecordRead, UseAnimeEditorRecordOptions } from './anime-editor-workspace.types';
import { useAnimeEditorDraftPickers } from './use-anime-editor-draft-pickers';
import { useAnimeEditorLifecycleActions } from './use-anime-editor-lifecycle-actions';
import { useAnimeEditorMetadataPatch } from './use-anime-editor-metadata-patch';
import { useAnimeEditorRecordRead } from './use-anime-editor-record-read';

/** Owns one selected record's authority, attempted draft, validation, and mutations. */
export function useAnimeEditorRecord(options: Readonly<UseAnimeEditorRecordOptions>) {
  // 1. Refs
  const { source, editorSource } = options;

  // 2. State
  const [state, setState] = useState<AnimeEditorRecordState>({
    draft: ANIME_EDITOR_DEFAULT_DRAFT,
    isLoadingRecord: false,
    isSaving: false,
    retainsAttemptedDraft: false,
  });

  // 3. Context/3rd Party Hooks
  /**
   * Merges a patch into the draft. The one place `draft` state actually
   * mutates -- hand-typing (`onDraftChange`) and a confirmed metadata
   * autofill (`onMetadataApplied`/`onMetadataUndo`, wired through the
   * composed {@link useAnimeEditorMetadataPatch}) both route through it, so
   * an autofill marks the draft dirty exactly as typing would (design D9).
   */
  const patchDraft = useCallback((patch: Partial<AnimeEditorDraft>) => {
    setState((current) => ({ ...current, draft: { ...current.draft, ...patch } }));
  }, []);
  const metadataPatch = useAnimeEditorMetadataPatch(state.draft, patchDraft);
  const draftPickers = useAnimeEditorDraftPickers(source, patchDraft);
  const { resetAppliedMetadata } = metadataPatch;
  /**
   * Replaces the draft from one settled read of the selected record; a failed
   * read clears the record and shows why. A pending Undo's pre-image belongs to
   * the record it was captured against, so a record swap drops it (design D9).
   */
  const applySettledRead = useCallback((read: AnimeEditorSettledRecordRead) => {
    setState((current) => ({
      ...current,
      selectedRecord: read.selectedRecord,
      draft: createAnimeEditorDraft(read.selectedRecord),
      retainsAttemptedDraft: false,
      recordLoadError: read.recordLoadError,
    }));
    resetAppliedMetadata();
  }, [resetAppliedMetadata]);
  const { isLoadingRecord, loadRecord } = useAnimeEditorRecordRead(editorSource, options.selectedAnimeId, applySettledRead);

  // 4. Queries/Mutations
  const saveMutation = useBridgeMutation({ mutationFn: (command: SaveAnimeEditorCommand) => editorSource.saveAnimeEditor(command) });
  const saveAnimeEditor = saveMutation.mutateAsync;

  // 5. Derived State (useMemo)
  const validationMessage = useMemo(() => state.selectedRecord === undefined ? undefined : validateAnimeEditorDraft(state.draft), [state.draft, state.selectedRecord]);
  const isDirty = useMemo(
    () => state.retainsAttemptedDraft || hasAnimeEditorChanges(state.selectedRecord, state.draft),
    [state.draft, state.retainsAttemptedDraft, state.selectedRecord],
  );
  const canSave = useMemo(() => state.selectedRecord !== undefined && isDirty && validationMessage === undefined, [isDirty, state.selectedRecord, validationMessage]);

  // 6. Callbacks (useCallback calling pure helpers)
  const onDraftChange = useCallback((field: keyof AnimeEditorDraft, value: string) => {
    patchDraft({ [field]: field === 'status' ? Number(value) : value } as Partial<AnimeEditorDraft>);
  }, [patchDraft]);
  const onDiscardChanges = useCallback(() => {
    setState((current) => ({ ...current, draft: createAnimeEditorDraft(current.selectedRecord), retainsAttemptedDraft: false }));
    metadataPatch.resetAppliedMetadata();
  }, [metadataPatch.resetAppliedMetadata]);
  const onSave = useCallback(async (): Promise<AnimeEditorSaveResult | undefined> => {
    if (state.selectedRecord === undefined) return undefined;
    const validation = validateAnimeEditorDraft(state.draft);
    if (validation !== undefined) {
      // The validation Alert already shows why; a blocked save does not toast.
      setState((current) => ({ ...current, retainsAttemptedDraft: true }));
      return { outcome: 'error', message: validation };
    }
    setState((current) => ({ ...current, isSaving: true }));
    try {
      const result = await raceAnimeEditorCall(saveAnimeEditor(createAnimeEditorSaveCommand(state.selectedRecord, state.draft)));
      if (isIntentionalEditorOutcome(result)) {
        const authority = result.record ?? (await editorSource.getAnimeEditorRecord(state.selectedRecord.animeId)).record;
        setState((current) => ({
          ...current, selectedRecord: authority, draft: createAnimeEditorDraft(authority),
          retainsAttemptedDraft: false,
        }));
        toast[toAnimeEditorToastKind(result.outcome)](resolveAnimeEditorFeedbackMessage(result, 'Changes saved.'));
      } else {
        setState((current) => ({ ...current, selectedRecord: result.record ?? current.selectedRecord, retainsAttemptedDraft: true }));
        toast[toAnimeEditorToastKind(result.outcome)](resolveAnimeEditorFeedbackMessage(result, 'No changes were applied.'));
      }
      return result;
    } catch (error) {
      const message = toEditorErrorMessage(error);
      setState((current) => ({ ...current, retainsAttemptedDraft: true }));
      toast.danger(message);
      return { outcome: 'error', message };
    } finally {
      setState((current) => ({ ...current, isSaving: false }));
    }
  }, [editorSource, saveAnimeEditor, state.draft, state.selectedRecord]);
  const lifecycle = useAnimeEditorLifecycleActions({ source, editorSource }, state.selectedRecord, setState, loadRecord);

  return {
    ...state,
    isLoadingRecord,
    recordLoadError: toShownRecordLoadError(isLoadingRecord, state.recordLoadError),
    appliedMetadata: metadataPatch.appliedMetadata,
    validationMessage, isDirty, canSave, onDraftChange, onDiscardChanges,
    onMetadataApplied: metadataPatch.onMetadataApplied,
    onMetadataUndo: metadataPatch.onMetadataUndo,
    onPickFolder: draftPickers.onPickFolder,
    onPickCoverFile: draftPickers.onPickCoverFile,
    onSave,
    onDeactivate: lifecycle.onDeactivate,
    onRestore: lifecycle.onRestore,
    onRepeat: lifecycle.onRepeat,
    loadRecord,
  };
}
