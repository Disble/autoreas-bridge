import { useCallback, useMemo } from 'react';
import type { Chord } from '../../keyboard.types';
import { useKeyboardStore } from '../../use-keyboard-store';
import { KEYMAP_PANEL_ERROR_MESSAGE } from './keymap-panel.constants';
import { groupBindingsBySection, listAllBindings, resolveKeymapPanelRows } from './keymap-panel.helpers';
import type { KeymapPanelProps, KeymapPanelSection, UseKeymapPanelResult } from './keymap-panel.types';

/**
 * Derives the keymap panel's render-ready state from the shared keyboard
 * store (design D10/D11). Slice 62g computed only the effective rows;
 * Slice 62h adds `errorMessage`, the single field `KeymapPanel` gates its
 * accessible loading/error triad on (task 8.2.2) -- `keymapLoadState`
 * already distinguishes a failed read from "loaded with zero overrides"
 * (design D11, shipped ahead of this slice in 62d), so no new store field
 * was needed, only this derivation. Chord capture, persistence and
 * conflict/shadow surfacing are Slices 62i-62k, so `onRebind`/`onRevert`/
 * `onResetToDefaults` are inert no-ops here and `saveErrorMessage` stays
 * `null` until a real save path exists.
 * @param _props Reserved for the injectable `source` Slice 62j wires into a
 * real persist path. Unread in this slice; kept on the signature so
 * `KeymapPanel.tsx`'s call shape never has to change again for it.
 */
export function useKeymapPanel(_props: Readonly<KeymapPanelProps> = {}): UseKeymapPanelResult {
  // 3. Context / 3rd party hooks
  const overrides = useKeyboardStore((state) => state.overrides);
  const keymapLoadState = useKeyboardStore((state) => state.keymapLoadState);

  // 5. Derived state
  const sections = useMemo<readonly KeymapPanelSection[]>(
    () =>
      groupBindingsBySection(listAllBindings()).map(({ section, bindings }) => ({
        section,
        rows: resolveKeymapPanelRows(bindings, overrides),
      })),
    [overrides],
  );
  // `saveErrorMessage` stays a stub `null` until Slice 62j wires a real save
  // path; declared as a variable (not inline in the return) so `errorMessage`
  // can read it without the two ever drifting out of sync.
  const saveErrorMessage: string | null = null;
  const errorMessage = keymapLoadState === 'failed' ? KEYMAP_PANEL_ERROR_MESSAGE : saveErrorMessage;

  // 6. Callbacks -- inert until Slices 62i-62k wire chord capture, persistence
  // and recovery. Each closes over nothing, so its `[]` deps array is an
  // EQUIVALENT MUTANT to mutation testing swapping it for a fixed-content
  // literal array (e.g. `["Stryker was here"]`): a compile-time-constant
  // string element compares equal to itself by `Object.is` on every render
  // exactly like an empty array does, so `useCallback` memoizes the same
  // function forever either way -- and nothing here observes these
  // callbacks' identity, only what calling them does (mirrors
  // `use-shortcuts-help-dialog.ts`'s `onOpenChange` precedent for the same
  // reasoning). A `// Stryker disable` comment does not suppress it here for
  // the same reason as that precedent: this array is a trailing call
  // argument, not a leading statement.
  const onRebind = useCallback((_id: string, _chord: Chord) => {}, []);
  const onRevert = useCallback((_id: string) => {}, []);
  const onResetToDefaults = useCallback(() => {}, []);

  return {
    keymapLoadState,
    saveErrorMessage,
    errorMessage,
    sections,
    onRebind,
    onRevert,
    onResetToDefaults,
  };
}
