import type { LibraryRootChangePreview } from '../../../../infrastructure/preferences-source/preferences-source.types';
import type { LibraryRootPreviewOutcome, PendingLibraryRootChange } from './library-root-panel.types';

/**
 * Turns a served preview into a change that needs confirmation, or null when no
 * active anime would move and the root can be saved straight away.
 */
export function toPendingLibraryRootChange(
  preview: LibraryRootChangePreview,
  newRoot: string,
): PendingLibraryRootChange | null {
  if (preview.moves.length === 0) {
    return null;
  }
  return { oldRoot: preview.oldRoot, newRoot, moves: preview.moves, kept: preview.kept };
}

/**
 * Decides what a served preview leads to: a failure to show, a straight save,
 * or a change to confirm because active animes would move.
 */
export function libraryRootPreviewOutcome(preview: LibraryRootChangePreview, newRoot: string): LibraryRootPreviewOutcome {
  if (preview.message !== undefined && preview.message !== '') {
    return { kind: 'failed', message: preview.message };
  }
  const pending = toPendingLibraryRootChange(preview, newRoot);
  return pending === null ? { kind: 'save' } : { kind: 'confirm', pending };
}

/** Confirm button copy, counting the animes that move. */
export function libraryRootChangeConfirmLabel(count: number): string {
  return `Change root and update ${count} ${count === 1 ? 'anime' : 'animes'}`;
}

/** Modal summary copy, counting the animes that move. */
export function libraryRootChangeSummary(count: number): string {
  const subject = count === 1 ? `Your 1 active anime will point to the new root. Its folder` : `Your ${count} active animes will point to the new root. Their folder`;
  return `${subject} inside the library stays the same. Inactive animes keep their saved folder.`;
}
