import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_LAYOUT_NAV_GROUPS } from '../../navigation/app-layout.constants';
import { flattenNavItems } from '../../navigation/app-layout.helpers';
import { KEYBOARD_COMMANDS } from '../command-registry.constants';
import { getKeyboardState, resetKeyboardStore } from '../keyboard-scope.helpers';
import { findDuplicateBindings } from '../registry.helpers';

beforeEach(() => {
  resetKeyboardStore();
});

describe('KEYBOARD_COMMANDS', () => {
  it('binds exactly one global command per APP_LAYOUT_NAV_GROUPS route, each navigating to that route on run()', () => {
    const navItems = flattenNavItems(APP_LAYOUT_NAV_GROUPS);

    for (const item of navItems) {
      const matches = KEYBOARD_COMMANDS.filter(
        (command) => command.scope === 'global' && command.section === 'Navigation' && command.label === item.label,
      );
      expect(matches).toHaveLength(1);

      const navigate = vi.fn();
      matches[0].run({ navigate });
      expect(navigate).toHaveBeenCalledWith(item.to);
    }
  });

  it('declares zero conflicting {scope, chord} bindings across the shipped registry', () => {
    expect(findDuplicateBindings(KEYBOARD_COMMANDS)).toEqual([]);
  });

  it('declares a non-empty section on every entry', () => {
    for (const command of KEYBOARD_COMMANDS) {
      expect(command.section.length).toBeGreaterThan(0);
    }
  });

  it('registers a global help command bound to ? that opens the shortcuts overlay when run', () => {
    const helpCommand = KEYBOARD_COMMANDS.find((command) => command.chord === '?');
    expect(helpCommand).toBeDefined();
    expect(helpCommand?.scope).toBe('global');

    helpCommand?.run({ navigate: vi.fn() });

    expect(getKeyboardState().isHelpOpen).toBe(true);
  });
});
