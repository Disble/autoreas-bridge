import { useEffect } from 'react';
import type { PreferencesSource } from '../../../../infrastructure/preferences-source/preferences-source.types';
import type { SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { INTAKE_RECONCILE_DEBOUNCE_MS } from './intake-panel.constants';
import type { useIntakeEditorState } from './use-intake-editor-state';
import type { useIntakeStoreSlice } from './use-intake-store-slice';

/** Everything the intake sync effects read from their caller. */
interface IntakeSyncEffectsInput {
  /** The editor state holding the mode, draft, and downloads-root setter. */
  readonly editor: ReturnType<typeof useIntakeEditorState>;
  /** The Season store slice holding the refresh and reconcile actions. */
  readonly store: ReturnType<typeof useIntakeStoreSlice>;
  /** The season port every row mutation goes through. */
  readonly source: SeasonSource;
  /** The port that supplies the configured downloads root. */
  readonly downloadsRootSource: Pick<PreferencesSource, 'getDownloadsRoot'>;
}

/**
 * useIntakeSyncEffects owns the intake panel's three effects: the initial row
 * refresh on mount, the configured downloads-root load, and the debounced
 * reconcile while editing the raw draft.
 * @param input The editor state, store slice, and both sources.
 */
export function useIntakeSyncEffects(input: Readonly<IntakeSyncEffectsInput>): void {
  const { editor, store, source, downloadsRootSource } = input;
  const { mode, rawDraft, setDownloadsRoot } = editor;
  const { refreshAnimes, reconcileIntake } = store;

  // 7. Effects
  useEffect(() => {
    void refreshAnimes(source);
  }, [refreshAnimes, source]);

  useEffect(() => {
    void downloadsRootSource.getDownloadsRoot().then((root) => {
      setDownloadsRoot(root);
    });
  }, [downloadsRootSource]);

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
