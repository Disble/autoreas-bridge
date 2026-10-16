import { useCallback } from 'react';
import type { SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { toggleSelection } from './intake-panel.helpers';
import type { useIntakeEditorState } from './use-intake-editor-state';
import type { useIntakeStoreSlice } from './use-intake-store-slice';

/** Everything the intake row callbacks read from their caller. */
interface IntakeRowCallbacksInput {
  /** The Season store slice holding the matching and discard actions. */
  readonly store: ReturnType<typeof useIntakeStoreSlice>;
  /** The editor state holding the creation selection. */
  readonly editor: ReturnType<typeof useIntakeEditorState>;
  /** The season port every row mutation goes through. */
  readonly source: SeasonSource;
}

/**
 * useIntakeRowCallbacks owns the thin per-row and footer actions: running
 * matching, rechecking availability, resolving, discarding or restoring one row, opening a
 * match page, and flipping one row's creation selection.
 * @param input The store slice, editor state, and season source.
 * @returns The row actions and the selection toggle.
 */
export function useIntakeRowCallbacks(input: Readonly<IntakeRowCallbacksInput>) {
  const { store, editor, source } = input;
  const { runMatching, recheckAvailability, resolveMatch, discardName, restoreName } = store;
  const { setSelected } = editor;

  // 6. Callbacks
  const onRunMatching = useCallback(() => {
    void runMatching(source);
  }, [runMatching, source]);
  const onRecheckAvailability = useCallback(() => {
    void recheckAvailability(source);
  }, [recheckAvailability, source]);
  const onResolve = useCallback(
    (rowId: string, pageUrl: string) => {
      void resolveMatch(source, rowId, pageUrl);
    },
    [resolveMatch, source],
  );
  const onDiscard = useCallback(
    (rowId: string) => {
      void discardName(source, rowId);
    },
    [discardName, source],
  );
  const onRestore = useCallback(
    (rowId: string) => {
      void restoreName(source, rowId);
    },
    [restoreName, source],
  );
  const onOpenPage = useCallback(
    (pageUrl: string) => {
      source.openPage(pageUrl);
    },
    [source],
  );
  // Stryker disable ArrayDeclaration: this deps array is mutation-equivalent whether it is `[]` or a
  // fixed literal such as `["Stryker was here"]`: the callback closes over only the React `setSelected`
  // setter, which is stable across renders, plus the module-level `toggleSelection` pure helper, and
  // either array is a render-constant, so React never observes a dependency change and the callback
  // identity is identical under both.
  const toggleSelect = useCallback((rowId: string) => {
    setSelected((prev) => toggleSelection(prev, rowId));
  }, []);
  // Stryker restore ArrayDeclaration

  return { onRunMatching, onRecheckAvailability, onResolve, onDiscard, onRestore, onOpenPage, toggleSelect };
}
