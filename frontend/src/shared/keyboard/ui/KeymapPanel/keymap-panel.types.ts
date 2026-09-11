import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { PreferencesSource } from '../../../../infrastructure/preferences-source/preferences-source.types';
import type { Chord, CommandBinding, CommandSection, KeymapLoadState } from '../../keyboard.types';
import type { ChordHazard } from '../../keymap.types';

/**
 * One section's raw bindings, grouped and ordered exactly like
 * `ShortcutSection` (`shortcuts-help-dialog.types.ts`) but over
 * `CommandBinding[]` rather than `CommandDefinition[]` -- the
 * registry-assembling helper (`listAllBindings`/`groupBindingsBySection`)
 * runs before overrides and hazards are applied, so no `run`/`enabled`
 * behavior is needed yet (design §3).
 */
export interface KeymapBindingSection {
  readonly section: CommandSection;
  readonly bindings: readonly CommandBinding[];
}

/**
 * One binding's panel-ready shape: its declared metadata plus everything
 * `KeymapBindingRow` needs beyond what the overlay's `ShortcutEntry`
 * carries -- the raw chord (via `binding.chord`), whether it is overridden,
 * its hazard and its scope note (design D10, the reason the panel does not
 * reuse `toShortcutSections`).
 */
export interface KeymapPanelRow {
  readonly binding: CommandBinding;
  readonly effectiveChord: Chord;
  readonly isOverridden: boolean;
  readonly hazard: ChordHazard | null;
  /** Rendered only for a scoped binding, e.g. "while the Notification Center is open"; `null` for a global command. */
  readonly scopeNote: string | null;
}

/** One section's enriched, render-ready rows -- the shape `use-keymap-panel` ultimately hands to `KeymapPanel`. */
export interface KeymapPanelSection {
  readonly section: CommandSection;
  readonly rows: readonly KeymapPanelRow[];
}

/** Public props contract for the Settings keymap panel (design D10, `shared/keyboard/ui/KeymapPanel/`). */
export interface KeymapPanelProps {
  /** Injectable, mirroring `AutoStartPanelProps.source`; defaults to the real `preferencesSource` singleton inside `use-keymap-panel`. */
  readonly source?: Pick<PreferencesSource, 'setKeymap'>;
}

/**
 * Outcome of one persisted rebind attempt (design D6/D8, Slice 62j).
 * `KeymapBindingRow` reads this to decide whether its capture control stays
 * armed (`'refused'` -- a same-scope duplicate, nothing written, the ONLY
 * status that stays armed) and what message to show (a refusal names the
 * colliding command; a shadow warns of the precedence rule; `'saved'`/
 * `'failed'` carry `null`, since a write failure is already surfaced via
 * `UseKeymapPanelResult.saveErrorMessage`/the panel's error `Alert`).
 */
export interface KeymapRebindOutcome {
  readonly status: 'refused' | 'saved' | 'shadowed' | 'failed';
  readonly message: string | null;
}

/**
 * Everything `KeymapPanel` needs to render, derived by `use-keymap-panel`
 * across Slices 62g-62k (rows in 62g, the load/error signal in 62h,
 * `onRebind`'s persist-then-publish path in 62j, `onRevert`/
 * `onResetToDefaults` in 62k). Declared here so the panel stays a dumb
 * component throughout (frontend architecture constraint #1): every field
 * it needs to decide what to render already exists on this contract.
 */
export interface UseKeymapPanelResult {
  /** Mirrors the store's `KeymapLoadState` (design D11) -- the panel gates its content branch on this, never on row count. */
  readonly keymapLoadState: KeymapLoadState;
  /** Set only by a failed save (design D6); a failed *load* is already covered by `keymapLoadState`. `null` when the last save succeeded or none was attempted. */
  readonly saveErrorMessage: string | null;
  /**
   * `KEYMAP_PANEL_ERROR_MESSAGE` while `keymapLoadState === 'failed'`, `saveErrorMessage`
   * otherwise, `null` when neither has failed (design D11/Slice 62h). `KeymapPanel` gates its
   * error `Alert` on this single field instead of re-deriving the load/save distinction itself,
   * keeping the component dumb (frontend architecture constraint #1).
   */
  readonly errorMessage: string | null;
  /** The complete binding map, grouped by section, resolved through the current overrides. */
  readonly sections: readonly KeymapPanelSection[];
  /** Attempts to persist `chord` for the command `id` (design D6/D8: refused on a same-scope duplicate, saved with a warning on a cross-scope shadow, saved plainly otherwise). */
  readonly onRebind: (id: string, chord: Chord) => Promise<KeymapRebindOutcome>;
  /** Restores one command's shipped chord, leaving every other override unchanged (spec "Per-binding revert restores one command's shipped chord using only pointer input"); resolves once the persist-then-publish write settles (design D6). */
  readonly onRevert: (id: string) => Promise<void>;
  /** Restores every shipped chord (spec "Reset-to-defaults restores every shipped chord using only pointer input"), via `SetKeymap("")` (design D5). */
  readonly onResetToDefaults: () => Promise<void>;
}

/**
 * The armed/record/cancel/blur capture state machine's return shape (design
 * D7). Its own hook, called from inside `KeymapBindingRow` (Slice 62i) so
 * `use-keymap-panel.ts` stays under the file-size target (design §5).
 */
export interface UseChordCaptureResult {
  readonly isArmed: boolean;
  /** The chord recorded so far this arming, or `null` before any keypress has produced one. */
  readonly candidateChord: Chord | null;
  /** Arms the control, ready to record the next chord. */
  readonly arm: () => void;
  /** The control's own `onKeyDown`: calls `preventDefault()` first and unconditionally (design D7), then records/cancels per the state machine. */
  readonly onKeyDown: (event: ReactKeyboardEvent) => void;
  /** Disarms on blur -- an armed-but-unfocused control is a lie (design D7). */
  readonly onBlur: () => void;
}
