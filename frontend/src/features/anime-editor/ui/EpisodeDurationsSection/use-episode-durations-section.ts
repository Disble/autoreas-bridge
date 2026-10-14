import { useCallback, useMemo, useState } from 'react';
import { createEpisodeDurationRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.helpers';
import type { EpisodeDurationRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';
import { useProgressiveListWindow } from '../../../../shared/hooks/use-progressive-list-window';
import { isEpisodeEditingLocked, toEpisodeDurationsFooter, toEpisodeDurationsToggleLabel } from './episode-durations-draft.helpers';
import { toEpisodeDurationsOverview, toEpisodeReanalysisProgressView, toEpisodeReanalyzeButton } from './episode-durations-section.helpers';
import type { UseEpisodeDurationsSectionOptions } from './episode-durations-section.types';
import { useEpisodeDurationForms } from './use-episode-duration-forms';
import { useEpisodeDurationsDraft } from './use-episode-durations-draft';
import { useEpisodeDurationsLoad } from './use-episode-durations-load';
import { useEpisodeReanalysis } from './use-episode-reanalysis';

/**
 * Composes the Editor's Episodes card (docs/episode-durations-editor-ui.md, S15):
 * the section read for the SAVED anime, the card's own draft with its Save and
 * Discard changes, the re-analysis and its review, the edit and add modals, the
 * Show/Hide toggle and the progressive table window. Nothing here touches the
 * anime data draft, and the anime Save never carries these edits.
 */
export function useEpisodeDurationsSection(options: Readonly<UseEpisodeDurationsSectionOptions>, source: EpisodeDurationRuntimeSource = createEpisodeDurationRuntimeSource()) {
  // 1. Refs

  // 2. State
  const [isOpen, setIsOpen] = useState(false);

  // 3. Context/3rd Party Hooks
  const draft = useEpisodeDurationsDraft({ animeId: options.animeId, source });
  const data = useEpisodeDurationsLoad({ ...options, edits: draft.edits, revision: draft.revision }, source);
  const overview = useMemo(() => toEpisodeDurationsOverview(data.load, data.rows, data.request), [data.load, data.request, data.rows]);
  const reanalysis = useEpisodeReanalysis({ request: data.request, edits: draft.edits, onEditsChange: draft.onEditsChange, source });
  const forms = useEpisodeDurationForms({ rows: data.rows, edits: draft.edits, onEditsChange: draft.onEditsChange, isTV: overview.isTV });
  const reviewRows = useMemo(() => reanalysis.review?.rows ?? [], [reanalysis.review]);
  const listWindow = useProgressiveListWindow(data.rows.length);
  const reviewWindow = useProgressiveListWindow(reviewRows.length);

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const isRunning = reanalysis.analysis.isRunning;
  const reanalyzeButton = useMemo(() => toEpisodeReanalyzeButton(data.load, isRunning), [data.load, isRunning]);
  const progress = useMemo(() => (reanalysis.analysis.isRunning ? toEpisodeReanalysisProgressView(reanalysis.analysis.progress) : undefined), [reanalysis.analysis]);
  const visibleRows = useMemo(() => data.rows.slice(0, listWindow.visibleCount), [data.rows, listWindow.visibleCount]);
  const visibleReviewRows = useMemo(() => reviewRows.slice(0, reviewWindow.visibleCount), [reviewRows, reviewWindow.visibleCount]);
  const footer = useMemo(
    () => toEpisodeDurationsFooter({ changes: draft.edits.length, isOpen, isRunning, isSaving: draft.isSaving }),
    [draft.edits.length, draft.isSaving, isOpen, isRunning],
  );
  const toggleLabel = toEpisodeDurationsToggleLabel(isOpen);

  // 6. Callbacks (useCallback calling pure helpers)
  // Stryker disable ArrayDeclaration: this deps array is mutation-equivalent whether it is `[]`
  // or a fixed literal such as `["Stryker was here"]`: React compares dependency arrays element by
  // element with `Object.is`, and the callback closes over a state setter only, so its identity
  // stays stable across rerenders under either one and no test can observe the difference.
  /** Shows or hides the table; hiding it never discards the draft. */
  const onToggle = useCallback(() => setIsOpen((current) => !current), []);
  // Stryker restore ArrayDeclaration

  // 7. Effects

  return {
    isOpen, toggleLabel, view: overview.view, summary: overview.summary, banner: overview.banner, notes: overview.notes,
    reanalyzeButton, progress, emptyCopy: overview.emptyCopy, failureMessage: overview.failureMessage,
    /** The rows of the progressive window, edits applied. */
    visibleRows,
    /** The Add episode row sits at the end of the list, so it shows once every row is rendered. */
    showsAddRow: listWindow.visibleCount >= data.rows.length,
    /** Row edits and Add episode are disabled while an analysis runs or a save is in flight; the rest of the Editor is not. */
    isEditingLocked: isEpisodeEditingLocked(isRunning, draft.isSaving),
    /** Whether the card holds unsaved edits; the Editor's unsaved-changes guard reads it. */
    isDirty: draft.isDirty,
    isSaving: draft.isSaving,
    /** Why the last episodes save failed, shown in the card until the next save or Discard changes. */
    saveError: draft.saveError,
    footer,
    listWindow,
    review: reanalysis.review,
    visibleReviewRows,
    reviewWindow,
    editView: forms.editView, editForm: forms.editForm, addView: forms.addView, addForm: forms.addForm,
    onToggle,
    /** Saves the card's own draft; the guard's Save and continue calls it too. */
    onSave: draft.onSave,
    /** Drops the card's own draft; the guard's Discard changes calls it too. */
    onDiscard: draft.onDiscard,
    onReanalyze: reanalysis.onReanalyze, onCancelAnalysis: reanalysis.onCancelAnalysis,
    onCloseReview: reanalysis.onCloseReview, onConfirmReview: reanalysis.onConfirmReview,
    onOpenEdit: forms.onOpenEdit, onEditMinutesChange: forms.onEditMinutesChange, onCloseEdit: forms.onCloseEdit,
    onApplyEdit: forms.onApplyEdit, onClearEdit: forms.onClearEdit,
    onOpenAdd: forms.onOpenAdd, onAddEpisodeChange: forms.onAddEpisodeChange, onAddMinutesChange: forms.onAddMinutesChange,
    onCloseAdd: forms.onCloseAdd, onApplyAdd: forms.onApplyAdd, onEditInstead: forms.onEditInstead,
  };
}
