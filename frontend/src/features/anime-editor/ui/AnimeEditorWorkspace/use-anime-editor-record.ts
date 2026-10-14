import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnimeEditorSaveResult, EpisodeDurationEdit } from '../../../../shared/contracts/anime.types';
import { ANIME_EDITOR_DEFAULT_DRAFT } from './anime-editor-workspace.constants';
import { createAnimeEditorDraft, createAnimeEditorSaveCommand, hasAnimeEditorChanges, isIntentionalEditorOutcome, resolveAnimeEditorFeedbackMessage, toEditorErrorMessage, validateAnimeEditorDraft } from './anime-editor-workspace.helpers';
import type { AnimeEditorDraft, AnimeEditorRecordState, UseAnimeEditorRecordOptions } from './anime-editor-workspace.types';
import { useAnimeEditorDraftPickers } from './use-anime-editor-draft-pickers';
import { useAnimeEditorLifecycleActions } from './use-anime-editor-lifecycle-actions';
import { useAnimeEditorMetadataPatch } from './use-anime-editor-metadata-patch';

/** Owns one selected record's authority, attempted draft, validation, and mutations. */
export function useAnimeEditorRecord(options: Readonly<UseAnimeEditorRecordOptions>) {
  // 1. Refs
  const loadSequence = useRef(0);
  const source = options.source;

  // 2. State
  const [state, setState] = useState<AnimeEditorRecordState>({
    draft: ANIME_EDITOR_DEFAULT_DRAFT,
    episodeEdits: [],
    episodeRevision: 0,
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

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const validationMessage = useMemo(() => state.selectedRecord === undefined ? undefined : validateAnimeEditorDraft(state.draft), [state.draft, state.selectedRecord]);
  const isDirty = useMemo(
    () => state.retainsAttemptedDraft || state.episodeEdits.length > 0 || hasAnimeEditorChanges(state.selectedRecord, state.draft),
    [state.draft, state.episodeEdits, state.retainsAttemptedDraft, state.selectedRecord],
  );
  const canSave = useMemo(() => state.selectedRecord !== undefined && isDirty && validationMessage === undefined, [isDirty, state.selectedRecord, validationMessage]);

  // 6. Callbacks (useCallback calling pure helpers)
  const loadRecord = useCallback(async (animeId: string) => {
    const request = loadSequence.current + 1;
    loadSequence.current = request;
    setState((current) => ({ ...current, isLoadingRecord: true, feedback: undefined }));
    try {
      const result = await source.getAnimeEditorRecord(animeId);
      if (loadSequence.current !== request) return;
      setState((current) => ({
        ...current,
        selectedRecord: result.record,
        draft: createAnimeEditorDraft(result.record),
        episodeEdits: [],
        retainsAttemptedDraft: false,
        feedback: result.outcome === 'error' ? resolveAnimeEditorFeedbackMessage(result, 'The editor record could not be loaded.') : undefined,
      }));
      // A pending Undo's pre-image belongs to the record it was captured
      // against -- swapping records without clearing it would let Undo
      // replay a stale pre-image onto an unrelated draft (design D9, "not
      // persisted").
      metadataPatch.resetAppliedMetadata();
    } catch (error) {
      if (loadSequence.current === request) setState((current) => ({ ...current, feedback: toEditorErrorMessage(error) }));
    } finally {
      if (loadSequence.current === request) setState((current) => ({ ...current, isLoadingRecord: false }));
    }
  }, [source, metadataPatch.resetAppliedMetadata]);
  const onDraftChange = useCallback((field: keyof AnimeEditorDraft, value: string) => {
    patchDraft({ [field]: field === 'status' ? Number(value) : value } as Partial<AnimeEditorDraft>);
  }, [patchDraft]);
  const onDiscardChanges = useCallback(() => {
    setState((current) => ({ ...current, draft: createAnimeEditorDraft(current.selectedRecord), episodeEdits: [], retainsAttemptedDraft: false, feedback: undefined }));
    metadataPatch.resetAppliedMetadata();
  }, [metadataPatch.resetAppliedMetadata]);
  // Stryker disable ArrayDeclaration: this deps array is mutation-equivalent whether it is `[]`
  // or a fixed literal such as `["Stryker was here"]`: React compares dependency arrays element by
  // element with `Object.is`, and the callback closes over a state setter only, so its identity
  // stays stable across rerenders under either one and no test can observe the difference.
  /** Replaces the draft's episode edits; the Episodes section computes the full list. */
  const onEpisodeEditsChange = useCallback((episodeEdits: readonly EpisodeDurationEdit[]) => {
    setState((current) => ({ ...current, episodeEdits }));
  }, []);
  // Stryker restore ArrayDeclaration
  const onSave = useCallback(async (): Promise<AnimeEditorSaveResult | undefined> => {
    if (state.selectedRecord === undefined) return undefined;
    const validation = validateAnimeEditorDraft(state.draft);
    if (validation !== undefined) {
      setState((current) => ({ ...current, feedback: validation, retainsAttemptedDraft: true }));
      return { outcome: 'error', message: validation };
    }
    setState((current) => ({ ...current, isSaving: true, feedback: undefined }));
    try {
      const result = await source.saveAnimeEditor(createAnimeEditorSaveCommand(state.selectedRecord, state.draft, state.episodeEdits));
      if (isIntentionalEditorOutcome(result)) {
        const authority = result.record ?? (await source.getAnimeEditorRecord(state.selectedRecord.animeId)).record;
        setState((current) => ({
          ...current, selectedRecord: authority, draft: createAnimeEditorDraft(authority), episodeEdits: [], episodeRevision: current.episodeRevision + 1,
          retainsAttemptedDraft: false, feedback: resolveAnimeEditorFeedbackMessage(result, 'Changes saved.'),
        }));
      } else {
        setState((current) => ({ ...current, selectedRecord: result.record ?? current.selectedRecord, retainsAttemptedDraft: true, feedback: resolveAnimeEditorFeedbackMessage(result, 'No changes were applied.') }));
      }
      return result;
    } catch (error) {
      const message = toEditorErrorMessage(error);
      setState((current) => ({ ...current, retainsAttemptedDraft: true, feedback: message }));
      return { outcome: 'error', message };
    } finally {
      setState((current) => ({ ...current, isSaving: false }));
    }
  }, [source, state.draft, state.episodeEdits, state.selectedRecord]);
  const lifecycle = useAnimeEditorLifecycleActions(source, state.selectedRecord, setState, loadRecord);

  // 7. Effects
  useEffect(() => {
    if (options.selectedAnimeId === undefined) {
      loadSequence.current += 1;
      return;
    }
    void loadRecord(options.selectedAnimeId);
  }, [loadRecord, options.selectedAnimeId]);

  return {
    ...state,
    appliedMetadata: metadataPatch.appliedMetadata,
    validationMessage, isDirty, canSave, onDraftChange, onDiscardChanges, onEpisodeEditsChange,
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
