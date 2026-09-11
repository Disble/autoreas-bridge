import { describe, expect, it, vi } from 'vitest';
import type { IconifyIcon } from '@iconify/react';
import type { NavGroup } from '../../navigation/app-layout.types';
import { buildNavigationCommands, findDuplicateBindings, findDuplicateCommandIds } from '../registry.helpers';
import type { CommandDefinition } from '../keyboard.types';

/** Minimal valid `IconifyIcon` for synthetic nav items -- only `body` is required. */
const STUB_ICON: IconifyIcon = { body: '' };

/** Builds a minimal command definition, overriding only what a case needs. */
function buildCommand(overrides: Partial<CommandDefinition> = {}): CommandDefinition {
  return {
    id: 'test.command',
    scope: 'global',
    chord: 'alt+1',
    label: 'Test',
    section: 'Navigation',
    run: () => {},
    ...overrides,
  };
}

describe('buildNavigationCommands', () => {
  it('builds one command per nav item that has an assigned chord, deriving id/label/section from the nav item and dispatching navigate through run()', () => {
    const navGroups: readonly NavGroup[] = [
      { id: 'g', label: 'Group', items: [{ to: '/today', label: 'Today', icon: STUB_ICON }] },
    ];
    const chordsByPath = { '/today': 'alt+1' };

    const commands = buildNavigationCommands(navGroups, chordsByPath);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      id: 'nav.today',
      scope: 'global',
      chord: 'alt+1',
      label: 'Today',
      section: 'Navigation',
    });

    const navigate = vi.fn();
    commands[0].run({ navigate });
    expect(navigate).toHaveBeenCalledWith('/today');
  });

  it('omits a nav item with no assigned chord, so an unbound route produces no command for it', () => {
    const navGroups: readonly NavGroup[] = [
      {
        id: 'g',
        label: 'Group',
        items: [
          { to: '/today', label: 'Today', icon: STUB_ICON },
          { to: '/new-route', label: 'New', icon: STUB_ICON },
        ],
      },
    ];
    const chordsByPath = { '/today': 'alt+1' };

    const commands = buildNavigationCommands(navGroups, chordsByPath);

    expect(commands).toHaveLength(1);
    expect(commands[0].label).toBe('Today');
  });
});

describe('findDuplicateBindings', () => {
  it('returns an empty array when no two entries share a {scope, chord} pair', () => {
    const commands = [buildCommand({ id: 'a', chord: 'alt+1' }), buildCommand({ id: 'b', chord: 'alt+2' })];

    expect(findDuplicateBindings(commands)).toEqual([]);
  });

  it('returns both conflicting command ids when two entries share {scope, chord}', () => {
    const commands = [
      buildCommand({ id: 'a', scope: 'global', chord: 'alt+1' }),
      buildCommand({ id: 'b', scope: 'global', chord: 'alt+1' }),
      buildCommand({ id: 'c', scope: 'global', chord: 'alt+2' }),
    ];

    expect(findDuplicateBindings(commands)).toEqual(['a', 'b']);
  });
});

describe('findDuplicateCommandIds', () => {
  it('returns an empty array when no two entries share an id', () => {
    const commands = [buildCommand({ id: 'a' }), buildCommand({ id: 'b', chord: 'alt+2' })];

    expect(findDuplicateCommandIds(commands)).toEqual([]);
  });

  it('returns both entries sharing a duplicated id', () => {
    const commands = [
      buildCommand({ id: 'dup', chord: 'alt+1' }),
      buildCommand({ id: 'dup', chord: 'alt+2' }),
      buildCommand({ id: 'unique', chord: 'alt+3' }),
    ];

    expect(findDuplicateCommandIds(commands)).toEqual(['dup', 'dup']);
  });
});
