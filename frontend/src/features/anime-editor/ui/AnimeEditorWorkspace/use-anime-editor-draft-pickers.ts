import { toast } from '@heroui/react';
import { useCallback } from 'react';
import type { PickerSource } from '../../../../shared/contracts/picker.types';
import { toEditorErrorMessage } from './anime-editor-workspace.helpers';
import type { AnimeEditorDraft } from './anime-editor-workspace.types';

/** Everything `useAnimeEditorDraftPickers` hands back to its caller. */
export interface UseAnimeEditorDraftPickersResult {
  /** Opens the folder picker and writes the chosen folder into the draft. */
  readonly onPickFolder: () => Promise<void>;
  /** Opens the image-file picker and writes the chosen file into the draft as an on-disk cover. */
  readonly onPickCoverFile: () => Promise<void>;
}

/**
 * Owns the draft's folder and cover-image file pickers, split out of
 * `useAnimeEditorRecord` (fallow complexity guard). Both pickers run through
 * the shell's picker port and write through the same `patchDraft` channel the
 * record hook itself uses for hand-typing and metadata autofill. A cancelled
 * dialog (`''`) changes nothing; a failed one leaves the draft as it was and
 * shows an error toast carrying the bridge's reason.
 * @param source The shell's native folder and image-file pickers.
 * @param patchDraft The one channel that mutates the draft.
 * @returns The two picker handlers the form panel wires up.
 */
export function useAnimeEditorDraftPickers(
  source: PickerSource,
  patchDraft: (patch: Partial<AnimeEditorDraft>) => void,
): UseAnimeEditorDraftPickersResult {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  /** Writes the picked path into the draft through `toPatch`; a cancel is a no-op, a failure a toast. */
  const pickIntoDraft = useCallback(async (pick: Promise<string>, toPatch: (path: string) => Partial<AnimeEditorDraft>) => {
    try {
      const path = await pick;
      if (path.length > 0) patchDraft(toPatch(path));
    } catch (error) {
      toast.danger(toEditorErrorMessage(error));
    }
  }, [patchDraft]);
  const onPickFolder = useCallback(
    () => pickIntoDraft(source.pickFolder('Select anime folder'), (folder) => ({ folder })),
    [source, pickIntoDraft],
  );
  const onPickCoverFile = useCallback(
    () => pickIntoDraft(source.pickFile('Select cover image'), (coverPath) => ({ coverType: 'image', coverPath })),
    [source, pickIntoDraft],
  );

  // 7. Effects

  return { onPickFolder, onPickCoverFile };
}
