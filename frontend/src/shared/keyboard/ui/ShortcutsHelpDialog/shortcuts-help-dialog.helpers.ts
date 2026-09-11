import { formatChord } from '../../chord.helpers';
import type { CommandDefinition, CommandSection } from '../../keyboard.types';
import type { ShortcutEntry, ShortcutSection } from './shortcuts-help-dialog.types';

/**
 * Groups commands by `section`, preserving the order each section first
 * appears in `commands`, and formats every entry's chord for display. Reads
 * only its argument and touches no shared state, so the dialog's content is
 * always exactly what the registry (plus whatever scope frame is active)
 * currently declares (spec "The Shortcuts Help Dialog Renders Content
 * Derived From The Registry").
 *
 * Grouped through a single `Map`, never a parallel order array plus a
 * fallback lookup: `Map` iterates in insertion order, so reading it back
 * with `.entries()` already yields "first appearance" order with no
 * `?? []` defensive fallback that nothing could ever reach.
 */
export function toShortcutSections(commands: readonly CommandDefinition[]): readonly ShortcutSection[] {
  const entriesBySection = new Map<CommandSection, ShortcutEntry[]>();

  for (const command of commands) {
    const entry: ShortcutEntry = { id: command.id, label: command.label, display: formatChord(command.chord) };
    const entries = entriesBySection.get(command.section);
    if (entries === undefined) {
      entriesBySection.set(command.section, [entry]);
      continue;
    }
    entries.push(entry);
  }

  return [...entriesBySection.entries()].map(([section, entries]) => ({ section, entries }));
}
