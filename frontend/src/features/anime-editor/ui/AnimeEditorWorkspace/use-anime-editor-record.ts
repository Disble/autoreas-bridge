import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnimeEditorSaveResult } from '../../../../shared/contracts/anime.types';
import { ANIME_EDITOR_DEFAULT_DRAFT } from './anime-editor-workspace.constants';
import { createAnimeEditorDraft, createAnimeEditorSaveCommand, hasAnimeEditorChanges, isIntentionalEditorOutcome, resolveAnimeEditorFeedbackMessage, toEditorErrorMessage, validateAnimeEditorDraft } from './anime-editor-workspace.helpers';
import type { AnimeEditorDraft, AnimeEditorRecordState, UseAnimeEditorRecordOptions } from './anime-editor-workspace.types';

/** Owns one selected record's authority, attempted draft, validation, and mutations. */
export function useAnimeEditorRecord(options: Readonly<UseAnimeEditorRecordOptions>) {
  // 1. Refs
  const loadSequence = useRef(0);
  const source = options.source;

  // 2. State
  const [state, setState] = useState<AnimeEditorRecordState>({
    draft: ANIME_EDITOR_DEFAULT_DRAFT,
    isLoadingRecord: false,
    isSaving: false,
    retainsAttemptedDraft: false,
  });

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const validationMessage = useMemo(() => state.selectedRecord === undefined ? undefined : validateAnimeEditorDraft(state.draft), [state.draft, state.selectedRecord]);
  const isDirty = useMemo(() => state.retainsAttemptedDraft || hasAnimeEditorChanges(state.selectedRecord, state.draft), [state.draft, state.retainsAttemptedDraft, state.selectedRecord]);
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
        retainsAttemptedDraft: false,
        feedback: result.outcome === 'error' ? resolveAnimeEditorFeedbackMessage(result, 'The editor record could not be loaded.') : undefined,
      }));
    } catch (error) {
      if (loadSequence.current === request) setState((current) => ({ ...current, feedback: toEditorErrorMessage(error) }));
    } finally {
      if (loadSequence.current === request) setState((current) => ({ ...current, isLoadingRecord: false }));
    }
  }, [source]);
  const onDraftChange = useCallback((field: keyof AnimeEditorDraft, value: string) => {
    setState((current) => ({ ...current, draft: { ...current.draft, [field]: field === 'status' ? Number(value) : value } }));
  }, []);
  const onDiscardChanges = useCallback(() => {
    setState((current) => ({ ...current, draft: createAnimeEditorDraft(current.selectedRecord), retainsAttemptedDraft: false, feedback: undefined }));
  }, []);
  const onPickFolder = useCallback(async () => {
    const path = await source.pickFolder('Select anime folder');
    if (path.length === 0) return;
    setState((current) => ({ ...current, draft: { ...current.draft, folder: path } }));
  }, [source]);
  const onSave = useCallback(async (): Promise<AnimeEditorSaveResult | undefined> => {
    if (state.selectedRecord === undefined) return undefined;
    const validation = validateAnimeEditorDraft(state.draft);
    if (validation !== undefined) {
      setState((current) => ({ ...current, feedback: validation, retainsAttemptedDraft: true }));
      return { outcome: 'error', message: validation };
    }
    setState((current) => ({ ...current, isSaving: true, feedback: undefined }));
    try {
      const result = await source.saveAnimeEditor(createAnimeEditorSaveCommand(state.selectedRecord, state.draft));
      if (isIntentionalEditorOutcome(result)) {
        const authority = result.record ?? (await source.getAnimeEditorRecord(state.selectedRecord.animeId)).record;
        setState((current) => ({ ...current, selectedRecord: authority, draft: createAnimeEditorDraft(authority), retainsAttemptedDraft: false, feedback: resolveAnimeEditorFeedbackMessage(result, 'Changes saved.') }));
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
  }, [source, state.draft, state.selectedRecord]);
  const onDeactivate = useCallback(async () => {
    if (state.selectedRecord === undefined) return undefined;
    setState((current) => ({ ...current, isSaving: true, feedback: undefined }));
    try {
      const result = await source.deactivateAnime(state.selectedRecord.animeId, state.selectedRecord.modifiedAt);
      const intentional = isIntentionalEditorOutcome(result);
      setState((current) => ({
        ...current,
        selectedRecord: result.record ?? current.selectedRecord,
        draft: intentional ? createAnimeEditorDraft(result.record) : current.draft,
        retainsAttemptedDraft: !intentional,
        feedback: resolveAnimeEditorFeedbackMessage(result, 'Deactivate anime was not applied.'),
      }));
      return result;
    } catch (error) {
      const message = toEditorErrorMessage(error);
      setState((current) => ({ ...current, retainsAttemptedDraft: true, feedback: message }));
      return { outcome: 'error' as const, message };
    } finally {
      setState((current) => ({ ...current, isSaving: false }));
    }
  }, [source, state.selectedRecord]);

  // 7. Effects
  useEffect(() => {
    if (options.selectedAnimeId === undefined) {
      loadSequence.current += 1;
      return;
    }
    void loadRecord(options.selectedAnimeId);
  }, [loadRecord, options.selectedAnimeId]);

  return { ...state, validationMessage, isDirty, canSave, onDraftChange, onDiscardChanges, onPickFolder, onSave, onDeactivate, loadRecord };
}
