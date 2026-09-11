import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router';
import { KEYBOARD_COMMANDS } from '../../command-registry.constants';
import { setKeyboardHelpOpen } from '../../keyboard-scope.helpers';
import type { CommandDefinition } from '../../keyboard.types';
import { useKeyboardStore } from '../../use-keyboard-store';
import { toShortcutSections } from './shortcuts-help-dialog.helpers';
import type { UseShortcutsHelpDialogResult } from './shortcuts-help-dialog.types';

/**
 * Derives the shortcuts overlay's full state from the shared keyboard store:
 * the given command set (defaulting to `KEYBOARD_COMMANDS`) plus whatever
 * scope frame is currently active, grouped for display (design §5 —
 * `[...KEYBOARD_COMMANDS, ...activeFrameCommands]`). Also closes the overlay
 * on a genuine route CHANGE, so navigating from inside it never leaves it
 * floating over the new page -- deliberately not on mount, since the overlay
 * is mounted once at the app shell and a mount-time close would fight
 * whatever `isHelpOpen` already was the instant it renders.
 * @param commands The base command set to render. Defaults to `KEYBOARD_COMMANDS`; injectable so a test can prove derivation without editing the dialog (spec S14).
 */
export function useShortcutsHelpDialog(commands: readonly CommandDefinition[] = KEYBOARD_COMMANDS): UseShortcutsHelpDialogResult {
  // 3. Context / 3rd party hooks
  const { pathname } = useLocation();
  const isOpen = useKeyboardStore((state) => state.isHelpOpen);
  const frames = useKeyboardStore((state) => state.frames);

  // 1. Refs (declared after the hook whose value seeds it, mirroring
  // use-keyboard-dispatcher.ts's navigateRef: there is no null initial state
  // and therefore no unreachable null branch to defend)
  const previousPathnameRef = useRef(pathname);

  // 5. Derived state
  const sections = useMemo(
    () => toShortcutSections([...commands, ...frames.flatMap((frame) => frame.getCommands())]),
    [commands, frames],
  );

  // 6. Callbacks
  const onOpenChange = useCallback((nextIsOpen: boolean) => {
    setKeyboardHelpOpen(nextIsOpen);
    // EQUIVALENT MUTANT: mutation testing swaps this `[]` for a constant
    // truthy array. Both are equivalent at runtime, for the exact reason
    // use-keyboard-dispatcher.ts's mount effect deps already documents: a
    // FIXED literal's content never changes across renders any more than an
    // empty array's does, so useCallback returns the same memoized function
    // forever either way, and nothing here observes callback identity -- only
    // what calling it does. A `// Stryker disable` comment does not suppress
    // it here for the same reason as that precedent: this array is a
    // trailing call argument, not a leading statement.
  }, []);

  // 7. Effects
  useEffect(() => {
    if (previousPathnameRef.current !== pathname) {
      setKeyboardHelpOpen(false);
    }
    previousPathnameRef.current = pathname;
  }, [pathname]);

  return { isOpen, onOpenChange, sections };
}
