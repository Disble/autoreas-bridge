import { APP_LAYOUT_NAV_GROUPS } from '../navigation/app-layout.constants';
import { setKeyboardHelpOpen } from './keyboard-scope.helpers';
import type { Chord, CommandDefinition } from './keyboard.types';
import { buildNavigationCommands } from './registry.helpers';

/**
 * Chord bound to each of the ten global navigation routes, keyed by path,
 * per the shipped keymap table (design §5). Hand-listed rather than derived
 * from list position: an added route with no entry here yields no command
 * for it, which is the point -- assigning the digit that would collide with
 * nothing stays a human decision (design §9), never an automatic `alt+11`.
 */
const NAV_COMMAND_CHORDS: Readonly<Record<string, Chord>> = {
  '/today': 'alt+1',
  '/downloads': 'alt+2',
  '/editor': 'alt+3',
  '/catalog': 'alt+4',
  '/history': 'alt+5',
  '/season': 'alt+6',
  '/devices': 'alt+7',
  '/activity': 'alt+8',
  '/notifications': 'alt+9',
  '/settings': 'alt+0',
};

/**
 * The shipped command registry: the ten global navigation commands derived
 * from `APP_LAYOUT_NAV_GROUPS`, plus the `?` command that opens the
 * shortcuts help overlay. This is the single source of truth the dispatcher,
 * the conflict checker and the help dialog all read (design §1).
 */
export const KEYBOARD_COMMANDS: readonly CommandDefinition[] = [
  ...buildNavigationCommands(APP_LAYOUT_NAV_GROUPS, NAV_COMMAND_CHORDS),
  {
    id: 'help.open',
    scope: 'global',
    chord: '?',
    label: 'Show keyboard shortcuts',
    section: 'Help',
    run: () => setKeyboardHelpOpen(true),
  },
];
