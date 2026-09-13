import { useCallback, useState } from 'react';
import { buildUndoPatch } from '../../../../shared/metadata-lookup/metadata-lookup.helpers';
import type { AnimeMetadataSelection, AppliedMetadata } from '../../../../shared/metadata-lookup/metadata-lookup.types';
import { toEditorDraftPatch } from './anime-editor-metadata.helpers';
import type { AnimeEditorDraft, UseAnimeEditorMetadataPatchResult } from './anime-editor-workspace.types';

/**
 * Owns the draft's applied/undo metadata-autofill state (design D9), split
 * out of `useAnimeEditorRecord` (fallow complexity guard -- Slice 7's
 * applied/undo state was the one thing pushing that hook past the threshold).
 * Applies a confirmed MyAnimeList selection through the same patch channel
 * the user's own typing uses and records its pre-image for Undo; never
 * decides when a pending Undo goes stale -- `resetAppliedMetadata` exists so
 * the owning hook can clear it on record swap and on discard.
 * @param draft The feature's current draft, read to build Undo's pre-image
 * at the moment a selection is applied.
 * @param patchDraft The one channel that mutates the draft -- shared with
 * hand-typing, so an autofill marks the draft dirty exactly as typing would.
 * @returns The pending Undo plus the handlers the record hook composes.
 */
export function useAnimeEditorMetadataPatch(
  draft: AnimeEditorDraft,
  patchDraft: (patch: Partial<AnimeEditorDraft>) => void,
): UseAnimeEditorMetadataPatchResult {
  // 1. Refs

  // 2. State
  /** The draft's pending Undo (design D9) -- absent once undone, discarded, or never applied. */
  const [appliedMetadata, setAppliedMetadata] = useState<AppliedMetadata<Partial<AnimeEditorDraft>> | undefined>(undefined);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  /**
   * Applies a confirmed MyAnimeList selection to the draft (design D9).
   * Maps the selection through {@link toEditorDraftPatch} and applies it
   * through the same {@link patchDraft} channel the user's own typing uses --
   * never a separate write path. Records the draft's pre-image for
   * `onMetadataUndo`.
   * @param selection The confirmed lookup's normalized, source-agnostic result.
   */
  const onMetadataApplied = useCallback((selection: AnimeMetadataSelection) => {
    const patch = toEditorDraftPatch(selection);
    const previous = buildUndoPatch(draft, patch);
    patchDraft(patch);
    setAppliedMetadata({ patch, previous, appliedFields: Object.keys(patch) as (keyof AnimeEditorDraft)[], unfilled: selection.unfilled });
  }, [draft, patchDraft]);
  /**
   * Reverts the draft's last applied metadata patch (design D9): replays the
   * recorded pre-image through the same {@link patchDraft} channel, then
   * clears the pending Undo. A no-op when nothing is applied.
   */
  const onMetadataUndo = useCallback(() => {
    if (appliedMetadata === undefined) {
      return;
    }
    patchDraft(appliedMetadata.previous);
    setAppliedMetadata(undefined);
  }, [appliedMetadata, patchDraft]);
  /**
   * Clears the pending Undo without replaying it. The owning hook calls this
   * whenever a pending Undo's pre-image would otherwise outlive the record or
   * draft it was captured against (record swap, discard).
   */
  const resetAppliedMetadata = useCallback(() => {
    setAppliedMetadata(undefined);
  }, []);

  // 7. Effects

  return { appliedMetadata, onMetadataApplied, onMetadataUndo, resetAppliedMetadata };
}
