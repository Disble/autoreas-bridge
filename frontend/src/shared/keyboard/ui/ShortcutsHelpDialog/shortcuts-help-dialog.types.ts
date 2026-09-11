import type { CommandDefinition, CommandSection } from '../../keyboard.types';

/** One renderable shortcut row: a command's label paired with its display-formatted chord. */
export interface ShortcutEntry {
  readonly id: string;
  readonly label: string;
  readonly display: string;
}

/** One section's grouped shortcut entries, in the order the section first appears in the source array. */
export interface ShortcutSection {
  readonly section: CommandSection;
  readonly entries: readonly ShortcutEntry[];
}

/** Everything `ShortcutsHelpDialog` needs to render, derived by `useShortcutsHelpDialog`. */
export interface UseShortcutsHelpDialogResult {
  /** Whether the overlay is showing, read straight from the shared keyboard store's `isHelpOpen`. */
  readonly isOpen: boolean;
  /** Wired directly to HeroUI `Modal`'s own `onOpenChange`, so Escape and backdrop dismissal also flow back into the store. */
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly sections: readonly ShortcutSection[];
}

/** Props accepted by `ShortcutsHelpDialog`. */
export interface ShortcutsHelpDialogProps {
  /**
   * The base command set to render, defaulting to `KEYBOARD_COMMANDS` inside
   * `useShortcutsHelpDialog`. Injectable so a test can prove the dialog
   * derives its content from a command it has never heard of, with no change
   * to the dialog's own code (spec "The Shortcuts Help Dialog Renders Content
   * Derived From The Registry").
   */
  readonly commands?: readonly CommandDefinition[];
}
