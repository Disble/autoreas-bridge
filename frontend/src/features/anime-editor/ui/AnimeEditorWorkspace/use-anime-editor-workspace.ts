import { useCallback, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { AnimeEditorRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type { AnimeEditorWorkspaceProps } from './anime-editor-workspace.types';
import { useAnimeEditorList } from './use-anime-editor-list';
import { useAnimeEditorListWindow } from './use-anime-editor-list-window';
import { useAnimeEditorRecord } from './use-anime-editor-record';
import { useAnimeEditorSchedule } from './use-anime-editor-schedule';
import { useAnimeEditorTransitions } from './use-anime-editor-transitions';

/** Composes focused record, transition, list, and schedule hooks for the editor workspace. */
export function useAnimeEditorWorkspace(props: Readonly<AnimeEditorWorkspaceProps>, source: AnimeEditorRuntimeSource = bridgeRuntimeSource) {
  // 1. Refs

  // 2. State
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isDeactivateConfirmOpen, setIsDeactivateConfirmOpen] = useState(false);

  // 3. Context/3rd Party Hooks
  const list = useAnimeEditorList({ initialAnimeId: props.initialAnimeId, source });
  const listWindow = useAnimeEditorListWindow(list.items.length);
  const record = useAnimeEditorRecord({ selectedAnimeId: list.selectedAnimeId, source });
  const schedule = useAnimeEditorSchedule({ selectedAnimeId: list.selectedAnimeId, source });
  const transitions = useAnimeEditorTransitions({
    selectedAnimeId: list.selectedAnimeId,
    loadItems: list.loadItems,
    setSelectedAnimeId: list.setSelectedAnimeId,
    loadRecord: record.loadRecord,
    saveRecord: record.onSave,
    deactivateRecord: record.onDeactivate,
    activateRecord: record.onActivate,
    discardRecord: record.onDiscardChanges,
    applySchedule: schedule.onApplySchedule,
    openSchedule: schedule.openSchedule,
    isDirty: record.isDirty,
  });

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const onToggleDetails = useCallback(() => setIsDetailsOpen((current) => !current), []);
  const onRequestDeactivate = useCallback(() => setIsDeactivateConfirmOpen(true), []);
  const onCancelDeactivate = useCallback(() => setIsDeactivateConfirmOpen(false), []);
  const onConfirmDeactivate = useCallback(async () => {
    setIsDeactivateConfirmOpen(false);
    await transitions.onDeactivate();
  }, [transitions]);

  // 7. Effects

  return {
    query: list.query, filter: list.filter, items: list.items, selectedAnimeId: list.selectedAnimeId,
    selectedRecord: record.selectedRecord, draft: record.draft,
    isLoadingList: list.isLoadingList, isLoadingRecord: record.isLoadingRecord, isSaving: record.isSaving,
    isApplyingSchedule: schedule.isApplyingSchedule, isDirty: record.isDirty,
    isScheduleModalOpen: schedule.isScheduleModalOpen, scheduleBoard: schedule.scheduleBoard,
    feedback: record.feedback, validationMessage: record.validationMessage, scheduleFeedback: schedule.scheduleFeedback,
    isDetailsOpen, isGuardOpen: transitions.isGuardOpen, canSave: record.canSave, listWindow, isDeactivateConfirmOpen,
    onQueryChange: list.setQuery, onFilterChange: list.onFilterChange, onSelectAnime: transitions.onSelectAnime, onDraftChange: record.onDraftChange,
    onToggleDetails, onDiscardChanges: record.onDiscardChanges, onPickFolder: record.onPickFolder, onPickCoverFile: record.onPickCoverFile, onSave: transitions.onSave, onDeactivate: transitions.onDeactivate, onActivate: transitions.onActivate,
    onRequestDeactivate, onCancelDeactivate, onConfirmDeactivate,
    onOpenSchedule: transitions.onOpenSchedule, onCloseSchedule: schedule.onCloseSchedule, onApplySchedule: transitions.onApplySchedule,
    onStayWithCurrentEditor: transitions.onStayWithCurrentEditor, onDiscardAndContinue: transitions.onDiscardAndContinue,
    onSaveAndContinue: transitions.onSaveAndContinue,
  };
}
