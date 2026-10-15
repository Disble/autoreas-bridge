import { useMemo } from 'react';
import {
  buildFolderPreviews,
  countMatchedWaitingForAvailability,
  countSearchFailed,
  countUnresolved,
  isCreatableRow,
  splitIntakeRows,
} from './intake-panel.helpers';
import type { useIntakeEditorState } from './use-intake-editor-state';
import type { useIntakeStoreSlice } from './use-intake-store-slice';

/** Everything the intake row derivations read from their caller. */
interface IntakeRowsInput {
  /** The Season store slice holding the rows. */
  readonly store: ReturnType<typeof useIntakeStoreSlice>;
  /** The editor state holding the downloads root and folder overrides. */
  readonly editor: ReturnType<typeof useIntakeEditorState>;
}

/**
 * useIntakeRows derives the row-level view model: the editable rows, the footer
 * counters (unresolved, search-failed, available, availability-pending), the
 * per-row folder previews, and the editable id set the metadata guards read.
 * Every memo is a one-line pure-helper call, so this hook adds no complexity of
 * its own. Split out of `useIntakePanel` with the counters unchanged —
 * `searchFailedCount` stays its own counter outside `countUnresolved`.
 * @param input The store slice and editor state the derivations read.
 * @returns The editable rows, their counters, previews, and id set.
 */
export function useIntakeRows(input: Readonly<IntakeRowsInput>) {
  const { store, editor } = input;
  const { seasonAnimes } = store;
  const { downloadsRoot, folderOverrides } = editor;

  // 5. Derived State (useMemo)
  const { editable } = useMemo(() => splitIntakeRows(seasonAnimes), [seasonAnimes]);
  const unresolvedCount = useMemo(() => countUnresolved(editable), [editable]);
  const searchFailedCount = useMemo(() => countSearchFailed(editable), [editable]);
  const availableCount = useMemo(() => editable.filter(isCreatableRow).length, [editable]);
  const availabilityPendingCount = useMemo(() => countMatchedWaitingForAvailability(editable), [editable]);
  const folderPreviews = useMemo(
    () => buildFolderPreviews(downloadsRoot, editable, folderOverrides),
    [downloadsRoot, editable, folderOverrides],
  );
  const editableIds = useMemo(() => new Set(editable.map((row) => row.id)), [editable]);

  return {
    editable,
    unresolvedCount,
    searchFailedCount,
    availableCount,
    availabilityPendingCount,
    folderPreviews,
    editableIds,
  };
}
