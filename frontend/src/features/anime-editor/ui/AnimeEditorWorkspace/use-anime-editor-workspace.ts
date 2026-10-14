import { useCallback, useMemo, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { AnimeEditorRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type { EpisodeDurationRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';
import { metadataLookupSource } from '../../../../infrastructure/metadata-lookup-source/metadata-lookup-source.helpers';
import { useEpisodeDurationsSection } from '../EpisodeDurationsSection/use-episode-durations-section';
import { isAnyCard } from './anime-editor-guard.helpers';
import { toAnimeEditorLifecycleConfirmation, toAnimeEditorListRowViewModels, toEpisodeDurationsSavedAnime } from './anime-editor-workspace.helpers';
import type { AnimeEditorCoverSource, AnimeEditorLifecycleAction, AnimeEditorWorkspaceProps } from './anime-editor-workspace.types';
import { useAnimeEditorCovers } from './use-anime-editor-covers';
import { useAnimeEditorCover } from './use-anime-editor-cover';
import { useAnimeEditorList } from './use-anime-editor-list';
import { useAnimeEditorListWindow } from './use-anime-editor-list-window';
import { useAnimeEditorRecord } from './use-anime-editor-record';
import { useAnimeEditorSchedule } from './use-anime-editor-schedule';
import { useAnimeEditorTransitions } from './use-anime-editor-transitions';

/**
 * Composes the editor workspace: the list, and three independent cards (S15,
 * S16) -- anime data, Episodes and Schedule -- each saving only its own data,
 * plus one unsaved-changes guard that covers both drafts.
 */
export function useAnimeEditorWorkspace(
  props: Readonly<AnimeEditorWorkspaceProps>,
  source: AnimeEditorRuntimeSource & AnimeEditorCoverSource = bridgeRuntimeSource,
  episodeSource: EpisodeDurationRuntimeSource | undefined = props.episodeSource,
) {
  // 1. Refs

  // 2. State
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [lifecycleAction, setLifecycleAction] = useState<AnimeEditorLifecycleAction | undefined>(undefined);

  // 3. Context/3rd Party Hooks
  const list = useAnimeEditorList({ initialAnimeId: props.initialAnimeId, source });
  const listWindow = useAnimeEditorListWindow(list.items.length);
  const record = useAnimeEditorRecord({ selectedAnimeId: list.selectedAnimeId, source });
  const coverCache = useAnimeEditorCovers(list.items, listWindow.visibleCount, record.selectedRecord, source);
  const schedule = useAnimeEditorSchedule({ selectedAnimeId: list.selectedAnimeId, source });
  // The Episodes card reads the SAVED record, never the anime card's unsaved draft (S15).
  const episodes = useEpisodeDurationsSection(toEpisodeDurationsSavedAnime(record.selectedRecord), episodeSource);
  const isDirty = isAnyCard(record.isDirty, episodes.isDirty);
  const transitions = useAnimeEditorTransitions({
    selectedAnimeId: list.selectedAnimeId,
    loadItems: list.loadItems,
    setSelectedAnimeId: list.setSelectedAnimeId,
    loadRecord: record.loadRecord,
    saveRecord: record.onSave,
    deactivateRecord: record.onDeactivate,
    restoreRecord: record.onRestore,
    repeatRecord: record.onRepeat,
    discardRecord: record.onDiscardChanges,
    discardEpisodes: episodes.onDiscard,
    applySchedule: schedule.onApplySchedule,
    openSchedule: schedule.openSchedule,
    reloadSchedule: schedule.reloadBoard,
    saveEpisodes: episodes.onSave,
    isDirty,
    isRecordDirty: record.isDirty,
    isEpisodesDirty: episodes.isDirty,
  });

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const lifecycleConfirmation = useMemo(() => (lifecycleAction === undefined ? undefined : toAnimeEditorLifecycleConfirmation(lifecycleAction)), [lifecycleAction]);
  const items = useMemo(() => toAnimeEditorListRowViewModels(list.items, coverCache.covers), [list.items, coverCache.covers]);
  const cover = useAnimeEditorCover(record.selectedRecord, coverCache.covers);

  // 6. Callbacks (useCallback calling pure helpers)
  const onToggleDetails = useCallback(() => setIsDetailsOpen((current) => !current), []);
  const onCancelLifecycleAction = useCallback(() => setLifecycleAction(undefined), []);
  const onConfirmLifecycleAction = useCallback(async () => {
    setLifecycleAction(undefined);
    if (lifecycleAction === 'deactivate') {
      await transitions.onDeactivate();
    } else if (lifecycleAction === 'restore') {
      await transitions.onRestore();
    } else if (lifecycleAction === 'repeat') {
      await transitions.onRepeat();
    }
  }, [lifecycleAction, transitions]);

  // 7. Effects

  return {
    query: list.query, filter: list.filter, items, listEmptyState: list.emptyState, selectedAnimeId: list.selectedAnimeId,
    selectedRecord: record.selectedRecord, draft: record.draft,
    /** The selected anime's saved-cover thumbnail state, rendered in the form header. */
    cover,
    /** Degrades one anime's thumbnail to the placeholder after a failed image decode. */
    onCoverImageError: coverCache.onCoverImageError,
    /** The draft's pending Undo (design D9) -- absent once undone, discarded, or never applied. */
    appliedMetadata: record.appliedMetadata,
    /** The Episodes card: its durations, re-analysis, modals and its own draft, Save and Discard. */
    episodes,
    /** The Schedule card's week strip for the selected anime. */
    scheduleWeek: schedule.scheduleWeek,
    /** The MyAnimeList lookup's two Wails-bound calls, injected into the form's lookup modal. */
    metadataLookupSource,
    isLoadingList: list.isLoadingList, isLoadingRecord: record.isLoadingRecord, isSaving: record.isSaving,
    isApplyingSchedule: schedule.isApplyingSchedule,
    /** Whether either card holds unsaved changes; the header chip and the guard read it. */
    isDirty,
    /** Whether the anime data card holds unsaved changes; its own Discard and Save read it. */
    isRecordDirty: record.isDirty,
    /** Whether any card save is in flight, which the guard's buttons wait for. */
    isGuardSaving: isAnyCard(record.isSaving, episodes.isSaving),
    isScheduleModalOpen: schedule.isScheduleModalOpen, scheduleBoard: schedule.scheduleBoard,
    feedback: record.feedback, validationMessage: record.validationMessage, scheduleFeedback: schedule.scheduleFeedback,
    isDetailsOpen, isGuardOpen: transitions.isGuardOpen, canSave: record.canSave, listWindow, lifecycleConfirmation,
    onQueryChange: list.setQuery, onFilterChange: list.onFilterChange, onClearCriteria: list.onClearCriteria, onSelectAnime: transitions.onSelectAnime, onDraftChange: record.onDraftChange,
    onToggleDetails, onDiscardChanges: record.onDiscardChanges, onPickFolder: record.onPickFolder, onPickCoverFile: record.onPickCoverFile, onSave: transitions.onSave, onDeactivate: transitions.onDeactivate, onRestore: transitions.onRestore, onRepeat: transitions.onRepeat,
    /** Applies a confirmed MyAnimeList selection to the draft (design D9/D10). */
    onMetadataApplied: record.onMetadataApplied,
    /** Reverts the draft's last applied metadata patch (design D9). */
    onMetadataUndo: record.onMetadataUndo,
    /** Asks to confirm a lifecycle action; the state setter is stable, so it needs no callback of its own. */
    onRequestLifecycleAction: setLifecycleAction as (action: AnimeEditorLifecycleAction) => void,
    onCancelLifecycleAction, onConfirmLifecycleAction,
    onOpenSchedule: transitions.onOpenSchedule, onCloseSchedule: schedule.onCloseSchedule, onApplySchedule: transitions.onApplySchedule,
    onStayWithCurrentEditor: transitions.onStayWithCurrentEditor, onDiscardAndContinue: transitions.onDiscardAndContinue,
    onSaveAndContinue: transitions.onSaveAndContinue,
  };
}
