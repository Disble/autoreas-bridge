import { KEYBOARD_COMMANDS } from '../../command-registry.constants';
import { effectiveChord, findChordHazard } from '../../keymap.helpers';
import { SCOPED_COMMAND_BINDINGS } from '../../keymap.constants';
import type { CommandBinding, CommandSection } from '../../keyboard.types';
import type { KeymapOverrides } from '../../keymap.types';
import { KEYMAP_SCOPE_NOTE_BY_SCOPE } from './keymap-panel.constants';
import type { KeymapBindingSection, KeymapPanelRow } from './keymap-panel.types';

/**
 * The complete shipped binding list: every global command plus the one
 * scoped command, which has no scope frame mounted until the Notification
 * Center is open and therefore no other way to be enumerated (design D3 --
 * "a map that omits Alt+R is a discoverability surface that lies").
 */
export function listAllBindings(): readonly CommandBinding[] {
  return [...KEYBOARD_COMMANDS, ...Object.values(SCOPED_COMMAND_BINDINGS)];
}

/**
 * Groups bindings by `section`, preserving the order each section first
 * appears -- the same rule `toShortcutSections` applies to commands
 * (`shortcuts-help-dialog.helpers.ts`), here over raw `CommandBinding[]`
 * since the panel resolves overrides and hazards on top of this grouping,
 * not before it (design §3). Grouped through a single `Map`, never a
 * parallel order array plus a fallback lookup, for the same reason
 * `toShortcutSections` does: `Map` iterates in insertion order, so reading
 * it back already yields "first appearance" order with no defensive
 * fallback nothing could ever reach.
 */
export function groupBindingsBySection(bindings: readonly CommandBinding[]): readonly KeymapBindingSection[] {
  const bindingsBySection = new Map<CommandSection, CommandBinding[]>();

  for (const binding of bindings) {
    const group = bindingsBySection.get(binding.section);
    if (group === undefined) {
      bindingsBySection.set(binding.section, [binding]);
      continue;
    }
    group.push(binding);
  }

  return [...bindingsBySection.entries()].map(([section, sectionBindings]) => ({ section, bindings: sectionBindings }));
}

/**
 * Resolves one section's raw bindings into panel-ready rows: the effective
 * chord via `effectiveChord` (design D2's single resolution rule -- not
 * `resolveKeymap`'s whole-array rewrite, since a row needs only the
 * resolved chord alongside its unchanged declared `binding`, never a second
 * rewritten binding object to index back into), whether an override exists
 * for the id, the hazard derived from the EFFECTIVE chord (so rebinding
 * into a hazardous chord surfaces it, not just the shipped default), and
 * the row's scope note.
 */
export function resolveKeymapPanelRows(bindings: readonly CommandBinding[], overrides: KeymapOverrides): readonly KeymapPanelRow[] {
  return bindings.map((binding) => {
    const chord = effectiveChord(binding, overrides);
    return {
      binding,
      effectiveChord: chord,
      isOverridden: overrides[binding.id] !== undefined,
      hazard: findChordHazard(chord),
      scopeNote: KEYMAP_SCOPE_NOTE_BY_SCOPE[binding.scope],
    };
  });
}
