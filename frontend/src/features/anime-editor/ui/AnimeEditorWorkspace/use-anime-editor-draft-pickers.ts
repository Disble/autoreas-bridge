import { useCallback } from 'react';
import type { AnimeEditorRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type { AnimeEditorDraft } from './anime-editor-workspace.types';

/** Everything `useAnimeEditorDraftPickers` hands back to its caller. */
export interface UseAnimeEditorDraftPickersResult {
  readonly onPickFolder: () => Promise<void>;
  readonly onPickCoverFile: () => Promise<void>;
}

/**
 * Owns the draft's folder and cover-image file pickers, split out of
 * `useAnimeEditorRecord` (fallow complexity guard). Both pickers write
 * through the same `patchDraft` channel the record hook itself uses for
 * hand-typing and metadata autofill, and are a no-op when the picker is
 * cancelled (an empty path).
 * @param source The editor's folder and cover-file picker calls.
 * @param patchDraft The one channel that mutates the draft.
 * @returns The two picker handlers the form panel wires up.
 */
export function useAnimeEditorDraftPickers(
  source: Pick<AnimeEditorRuntimeSource, 'pickFolder' | 'pickFile'>,
  patchDraft: (patch: Partial<AnimeEditorDraft>) => void,
): UseAnimeEditorDraftPickersResult {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const onPickFolder = useCallback(async () => {
    const path = await source.pickFolder('Select anime folder');
    if (path.length === 0) return;
    patchDraft({ folder: path });
  }, [source, patchDraft]);
  const onPickCoverFile = useCallback(async () => {
    const path = await source.pickFile('Select cover image');
    if (path.length === 0) return;
    patchDraft({ coverType: 'image', coverPath: path });
  }, [source, patchDraft]);

  // 7. Effects

  return { onPickFolder, onPickCoverFile };
}
