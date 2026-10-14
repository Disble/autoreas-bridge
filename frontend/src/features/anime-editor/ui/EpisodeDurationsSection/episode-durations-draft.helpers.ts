import type { EpisodeDurationRuntimeSource, EpisodeDurationSaveResult } from '../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';
import type { EpisodeDurationEdit } from '../../../../shared/contracts/anime.types';
import { EPISODE_DURATIONS_HIDE_LABEL, EPISODE_DURATIONS_SAVE_FAILED_MESSAGE, EPISODE_DURATIONS_SHOW_LABEL } from './episode-durations-section.constants';
import { toEpisodeErrorMessage } from './episode-durations-section.helpers';
import type { EpisodeDurationsDraftState, EpisodeDurationsFooterInput, EpisodeDurationsFooterView } from './episode-durations-section.types';

/** "1 unsaved change", "3 unsaved changes", or "No unsaved changes". */
export function formatEpisodeUnsavedChanges(count: number): string {
  if (count === 0) return 'No unsaved changes';
  return count === 1 ? '1 unsaved change' : `${count} unsaved changes`;
}

/** The Show/Hide toggle's label for the current table visibility. */
export function toEpisodeDurationsToggleLabel(isOpen: boolean): string {
  return isOpen ? EPISODE_DURATIONS_HIDE_LABEL : EPISODE_DURATIONS_SHOW_LABEL;
}

/**
 * The card footer. It shows while the table shows, and also while edits are
 * unsaved, because hiding the table never discards nor hides the draft. Save
 * waits for a running re-analysis; nothing runs twice while a save is in flight.
 */
export function toEpisodeDurationsFooter(input: EpisodeDurationsFooterInput): EpisodeDurationsFooterView {
  const hasChanges = input.changes > 0;
  return {
    isVisible: input.isOpen || hasChanges,
    unsavedLabel: formatEpisodeUnsavedChanges(input.changes),
    canSave: hasChanges && !input.isRunning && !input.isSaving,
    canDiscard: hasChanges && !input.isSaving,
  };
}

/** Saves the card edits, turning a thrown binding into an error answer the card can show. */
export async function saveEpisodeDurationEdits(
  source: EpisodeDurationRuntimeSource,
  animeId: string,
  edits: readonly EpisodeDurationEdit[],
): Promise<EpisodeDurationSaveResult> {
  try {
    return await source.saveEpisodeDurations(animeId, edits);
  } catch (error) {
    return { outcome: 'error', message: toEpisodeErrorMessage(error), changed: 0 };
  }
}

/**
 * Settles the draft with a save answer: a write or a no-op clears the edits and
 * bumps the revision so the rows read again; an error keeps the edits and says why.
 */
export function settleEpisodeDurationsSave(state: EpisodeDurationsDraftState, result: EpisodeDurationSaveResult): EpisodeDurationsDraftState {
  if (result.outcome === 'error') return { ...state, isSaving: false, saveError: result.message ?? EPISODE_DURATIONS_SAVE_FAILED_MESSAGE };
  return { edits: [], revision: state.revision + 1, isSaving: false, saveError: undefined };
}

/** Row edits and Add episode wait while an analysis runs or a save is in flight. */
export function isEpisodeEditingLocked(isRunning: boolean, isSaving: boolean): boolean {
  return isRunning || isSaving;
}
