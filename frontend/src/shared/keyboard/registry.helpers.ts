import { flattenNavItems } from '../navigation/app-layout.helpers';
import type { NavGroup } from '../navigation/app-layout.types';
import type { Chord, CommandDefinition } from './keyboard.types';

/**
 * Builds one global navigation command per nav item that has an assigned
 * chord in `chordsByPath`. A nav item with no entry there yields no command
 * for it -- assigning a chord to a newly added route stays a human decision,
 * there is no automatic eleventh digit (design §9).
 */
export function buildNavigationCommands(
  navGroups: readonly NavGroup[],
  chordsByPath: Readonly<Record<string, Chord>>,
): readonly CommandDefinition[] {
  return flattenNavItems(navGroups).reduce<CommandDefinition[]>((commands, item) => {
    const chord = chordsByPath[item.to];
    if (chord === undefined) {
      return commands;
    }
    commands.push({
      // Every `NavItem.to` in this app starts with `/` (app-layout.constants.ts),
      // so a plain slice drops it -- no regex needed for a fixed-position cut.
      id: `nav.${item.to.slice(1)}`,
      scope: 'global',
      chord,
      label: item.label,
      section: 'Navigation',
      run: ({ navigate }) => navigate(item.to),
    });
    return commands;
  }, []);
}

/**
 * Finds every command id involved in a duplicate `{scope, chord}` binding --
 * two entries claiming the same chord in the same scope (spec Requirement
 * "The Command Registry Is A Typed, Duplicate-Free Source Of Truth").
 * Returns an empty array when the registry has none.
 */
export function findDuplicateBindings(commands: readonly CommandDefinition[]): readonly string[] {
  return collectDuplicateIds(commands, (command) => `${command.scope}::${command.chord}`);
}

/**
 * Finds every command id that collides with another entry's `id`. A
 * duplicate `id` is always a registry authoring mistake, distinct from a
 * duplicate binding: two different ids may never coincidentally share it.
 */
export function findDuplicateCommandIds(commands: readonly CommandDefinition[]): readonly string[] {
  return collectDuplicateIds(commands, (command) => command.id);
}

/**
 * Groups command ids by `keyOf` and returns every id belonging to a group
 * with more than one member, shared by both duplicate-detection functions
 * above so the grouping logic is written once.
 */
function collectDuplicateIds(
  commands: readonly CommandDefinition[],
  keyOf: (command: CommandDefinition) => string,
): readonly string[] {
  const idsByKey = new Map<string, string[]>();
  for (const command of commands) {
    const key = keyOf(command);
    const ids = idsByKey.get(key) ?? [];
    ids.push(command.id);
    idsByKey.set(key, ids);
  }
  return [...idsByKey.values()].filter((ids) => ids.length > 1).flat();
}
