import type { NavigateFunction } from 'react-router';

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
};
