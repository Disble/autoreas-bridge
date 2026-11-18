import { useEffect } from 'react';
import type { SeasonSource } from '../../../../shared/contracts/season.types';
import { connectSeasonMatchingStore, disconnectSeasonMatchingStore } from '../../../../shared/store/season-store/season-store.helpers';
import { INTAKE_RECONCILE_DEBOUNCE_MS } from './intake-panel.constants';
import type { useIntakeEditorState } from './use-intake-editor-state';
import type { useIntakeStoreSlice } from './use-intake-store-slice';

/** Everything the intake sync effects read from their caller. */
interface IntakeSyncEffectsInput {
  /** The editor state holding the mode and draft. */
  readonly editor: ReturnType<typeof useIntakeEditorState>;
  /** The Season store slice holding the refresh and reconcile actions. */
  readonly store: ReturnType<typeof useIntakeStoreSlice>;
  /** The season port every row mutation goes through. */
  readonly source: SeasonSource;
}

/**
 * useIntakeSyncEffects owns the intake panel's two effects: the debounced
 * reconcile while editing the raw draft, and the live matching-run
 * subscription. The rows and the library root are queries of their own. The subscription stays out of the read-only history view --
 * its rows belong to a closed season, so a live run must never banner over
 * them -- and dropping it on unmount drops the ephemeral run with it.
 * @param input The editor state, store slice, and season source.
 */
export function useIntakeSyncEffects(input: Readonly<IntakeSyncEffectsInput>): void {
  const { editor, store, source } = input;
  const { mode, rawDraft } = editor;
  const { readOnly, reconcileIntake } = store;

  // 7. Effects
  useEffect(() => {
    if (readOnly) {
      return undefined;
    }
    connectSeasonMatchingStore(source);
    return () => {
      disconnectSeasonMatchingStore();
    };
  }, [readOnly, source]);

  // Debounced reconcile while editing the raw draft.
  useEffect(() => {
    if (mode !== 'raw') {
      return undefined;
    }
    const timer = setTimeout(() => {
      void reconcileIntake(source, rawDraft);
    }, INTAKE_RECONCILE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [mode, rawDraft, reconcileIntake, source]);
}
