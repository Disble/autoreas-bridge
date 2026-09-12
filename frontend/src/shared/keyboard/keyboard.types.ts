import type { NavigateFunction } from 'react-router';
import type { KeymapOverrides } from './keymap.types';

/** Canonical chord string: `ctrl+alt+shift+meta+<key>`, e.g. `alt+1`, `alt+shift+r`, `?`. */
export type Chord = string;

/** Which surface a command belongs to. `global` is always resolvable; the rest are stack frames. */
export type KeyboardScope = 'global' | 'notification-center';

/** Help-dialog grouping. Presentation only — it never affects resolution. */
export type CommandSection = 'Navigation' | 'Notifications' | 'Help';

/**
 * Everything environmental a command needs, injected at dispatch time so the
 * registry can stay a plain constant array that tests, the conflict checker and
 * the help dialog all read without rendering anything.
 */
export interface CommandContext {
  readonly navigate: NavigateFunction;
}

/**
 * One binding's identity and metadata -- everything the keymap, the map UI
 * and the conflict checker need, with no behavior attached (design D3).
 */
export interface CommandBinding {
  readonly id: string;
  readonly scope: KeyboardScope;
  readonly chord: Chord;
  /** Rendered verbatim by the help dialog. Nav labels are reused from `APP_LAYOUT_NAV_GROUPS`. */
  readonly label: string;
  readonly section: CommandSection;
}

/**
 * A binding plus what it does. `enabled`/`run` close over feature state, so
 * they never leave the feature that declares them (design D3).
 */
export interface CommandDefinition extends CommandBinding {
  /** Absent means always enabled. False means the chord is claimed and swallowed (D9). */
  readonly enabled?: () => boolean;
  readonly run: (context: CommandContext) => void;
}

/**
 * A frame on the scope stack. `getCommands` is read lazily at dispatch time so a
 * frame pushed once can never run a stale closure (D10).
 */
export interface KeyboardScopeFrame {
  readonly id: number;
  readonly scope: KeyboardScope;
  readonly getCommands: () => readonly CommandDefinition[];
}

/** Zustand state contract for the shared keyboard read-model. */
export type KeyboardStoreState = {
  /** Innermost frame last. Resolution walks this top-down before falling back to `KEYBOARD_COMMANDS`. */
  readonly frames: readonly KeyboardScopeFrame[];
  /** Whether the shortcuts overlay is showing. It lives here because the `?` command runs outside React. */
  readonly isHelpOpen: boolean;
  /** User-owned chord overrides, keyed by command id (design D1). `{}` until the persisted keymap loads, and whenever a command has no override. */
  readonly overrides: KeymapOverrides;
  /**
   * How the persisted keymap's one load attempt ended (design D11).
   *
   * Three states, not a boolean, because the panel owes three different
   * renderings and a boolean can only express two. The spec requires that a
   * failed load render the panel's ERROR state, "never a loading placeholder
   * or an empty state" -- and a failed load and a user who has simply
   * rebound nothing both leave `overrides` at `{}`, so the outcome has to be
   * recorded separately or the two become indistinguishable.
   *
   * A malformed stored document is `'loaded'`, not `'failed'`: it arrived
   * fine and `parseKeymap` degraded its contents to `{}`. Only a rejected
   * read -- an unattached binding, a throw -- is `'failed'`.
   *
   * `'pending'` strands nothing: with `overrides` still `{}` every command
   * already answers to its declared chord, so shortcuts work during the load.
   */
  readonly keymapLoadState: KeymapLoadState;
};

/**
 * The outcome of the keymap's single load attempt. See
 * `KeyboardStoreState.keymapLoadState` for why a failed read is distinct from
 * a document that parsed to no overrides.
 */
export type KeymapLoadState = 'pending' | 'loaded' | 'failed';
