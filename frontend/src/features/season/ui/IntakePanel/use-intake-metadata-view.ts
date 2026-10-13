import { useMemo } from 'react';
import { pickRowEntries } from './intake-panel.helpers';
import { buildAppliedMetadataView, buildStoredMetadataByRow } from './intake-metadata-view.helpers';
import type { useIntakeEditorState } from './use-intake-editor-state';
import type { useIntakeRows } from './use-intake-rows';

/** Everything the intake metadata view reads from its caller. */
interface IntakeMetadataViewInput {
  /** The row derivations holding the editable rows and their id set. */
  readonly rows: ReturnType<typeof useIntakeRows>;
  /** The editor state holding this session's per-row metadata records. */
  readonly editor: ReturnType<typeof useIntakeEditorState>;
}

/**
 * useIntakeMetadataView derives what each visible row shows for its lookup: the
 * stored record from an earlier session, the session-over-stored merge, both
 * records narrowed to the rows still on screen, and the applied summary the row
 * chip reads. Both records are narrowed rather than pruned in an effect: a row
 * that is gone cannot display its lookup, and a refresh that keeps the same ids
 * costs no state write at all. The underlying records keep a departed row's
 * entry, so an id that returns shows what it had before.
 * @param input The row derivations and editor state the view reads.
 * @returns The stored merge, the visible records, and the applied summary.
 */
export function useIntakeMetadataView(input: Readonly<IntakeMetadataViewInput>) {
  const { rows, editor } = input;
  const { editable, editableIds } = rows;
  const { metadataByRow, appliedMetadataByRow } = editor;

  // 5. Derived State (useMemo)
  const storedMetadataByRow = useMemo(() => buildStoredMetadataByRow(editable), [editable]);
  const heldByRow = useMemo(() => ({ ...storedMetadataByRow, ...metadataByRow }), [storedMetadataByRow, metadataByRow]);
  const visibleMetadataByRow = useMemo(() => pickRowEntries(heldByRow, editableIds), [heldByRow, editableIds]);
  const visibleAppliedMetadataByRow = useMemo(
    () => pickRowEntries(appliedMetadataByRow, editableIds),
    [appliedMetadataByRow, editableIds],
  );
  const appliedMetadataView = useMemo(
    () => buildAppliedMetadataView(visibleMetadataByRow, visibleAppliedMetadataByRow),
    [visibleMetadataByRow, visibleAppliedMetadataByRow],
  );

  return {
    storedMetadataByRow,
    heldByRow,
    visibleMetadataByRow,
    visibleAppliedMetadataByRow,
    appliedMetadataView,
  };
}
