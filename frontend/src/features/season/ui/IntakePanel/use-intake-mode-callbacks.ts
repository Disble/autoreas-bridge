import { useCallback } from 'react';
import type { SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { buildRawText } from './intake-panel.helpers';
import type { IntakeMode } from './intake-panel.types';
import type { useIntakeEditorState } from './use-intake-editor-state';
import type { useIntakeStoreSlice } from './use-intake-store-slice';

/** Everything the intake mode callbacks read from their caller. */
interface IntakeModeCallbacksInput {
  /** The editor state holding the mode and its draft. */
  readonly editor: ReturnType<typeof useIntakeEditorState>;
  /** The Season store slice holding the rows and the reconcile action. */
  readonly store: ReturnType<typeof useIntakeStoreSlice>;
  /** The season port every row mutation goes through. */
  readonly source: SeasonSource;
}

/**
 * useIntakeModeCallbacks owns the Raw/List mode switch and the draft edit: the
 * switch flushes the draft through reconcile before rendering List, and seeds
 * the draft from the editable names when opening Raw.
 * @param input The editor state, store slice, and season source.
 * @returns The mode switch and the draft-change handler.
 */
export function useIntakeModeCallbacks(input: Readonly<IntakeModeCallbacksInput>) {
  const { editor, store, source } = input;
  const { mode, rawDraft, setMode, setRawDraft } = editor;
  const { seasonAnimes, reconcileIntake } = store;

  // 6. Callbacks
  const switchMode = useCallback(
    (next: IntakeMode) => {
      if (next === mode) {
        return;
      }
      // Past the same-mode guard `next` differs from `mode`, and the mode is
      // either 'raw' or 'list' -- so reaching List means leaving Raw, and the
      // flush condition needs no second operand.
      if (next === 'list') {
        void reconcileIntake(source, rawDraft); // flush the draft before rendering
      }
      if (next === 'raw') {
        setRawDraft(buildRawText(seasonAnimes));
      }
      setMode(next);
    },
    [mode, rawDraft, seasonAnimes, reconcileIntake, source],
  );
  // Stryker disable ArrayDeclaration: this deps array is mutation-equivalent whether it is `[]` or a
  // fixed literal such as `["Stryker was here"]`: the callback closes over only the React `setRawDraft`
  // setter, which is stable across renders, and either array is a render-constant, so React never
  // observes a dependency change and the callback identity is identical under both.
  const onRawChange = useCallback((text: string) => {
    setRawDraft(text);
  }, []);
  // Stryker restore ArrayDeclaration

  return { switchMode, onRawChange };
}
