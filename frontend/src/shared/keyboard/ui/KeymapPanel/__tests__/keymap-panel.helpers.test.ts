import { describe, expect, it } from 'vitest';
import { KEYBOARD_COMMANDS } from '../../../command-registry.constants';
import type { CommandBinding } from '../../../keyboard.types';
import type { KeymapOverrides } from '../../../keymap.types';
import { SCOPED_COMMAND_BINDINGS } from '../../../keymap.constants';
import { groupBindingsBySection, listAllBindings, resolveKeymapPanelRows } from '../keymap-panel.helpers';

/** Builds a minimal command binding, overriding only what a case needs. */
function buildBinding(overrides: Partial<CommandBinding> = {}): CommandBinding {
  return {
    id: 'test.command',
    scope: 'global',
    chord: 'alt+1',
    label: 'Test',
    section: 'Navigation',
    ...overrides,
  };
}

describe('listAllBindings', () => {
  it('returns every KEYBOARD_COMMANDS entry plus every scoped binding, asserted by length and presence rather than a hand-listed array', () => {
    const bindings = listAllBindings();

    expect(bindings).toHaveLength(KEYBOARD_COMMANDS.length + Object.keys(SCOPED_COMMAND_BINDINGS).length);
    expect(bindings.some((binding) => binding.id === 'notification-center.mark-all-read')).toBe(true);
  });
});

describe('groupBindingsBySection', () => {
  it('groups bindings by section, preserving first-appearance order for sections and original order within each section', () => {
    const bindings = [
      buildBinding({ id: 'a', section: 'Navigation' }),
      buildBinding({ id: 'b', section: 'Help' }),
      buildBinding({ id: 'c', section: 'Navigation' }),
    ];

    const sections = groupBindingsBySection(bindings);

    expect(sections.map((entry) => entry.section)).toEqual(['Navigation', 'Help']);
    expect(sections[0].bindings.map((binding) => binding.id)).toEqual(['a', 'c']);
    expect(sections[1].bindings.map((binding) => binding.id)).toEqual(['b']);
  });

  it('returns an empty array for an empty binding list', () => {
    expect(groupBindingsBySection([])).toEqual([]);
  });

  it('groups the real listAllBindings() output with the scoped binding under its declared Notifications section', () => {
    const sections = groupBindingsBySection(listAllBindings());

    const notificationsSection = sections.find((entry) => entry.section === 'Notifications');

    expect(notificationsSection?.bindings.some((binding) => binding.id === 'notification-center.mark-all-read')).toBe(true);
  });
});

describe('resolveKeymapPanelRows', () => {
  it('keeps a binding at its declared chord and marks it not overridden when no override exists', () => {
    const [row] = resolveKeymapPanelRows([buildBinding({ chord: 'alt+1' })], {});

    expect(row.effectiveChord).toBe('alt+1');
    expect(row.isOverridden).toBe(false);
    expect(row.binding.chord).toBe('alt+1');
  });

  it('resolves a stored override and marks the row overridden, leaving the declared binding chord untouched', () => {
    const overrides: KeymapOverrides = { 'test.command': 'ctrl+1' };
    const [row] = resolveKeymapPanelRows([buildBinding({ chord: 'alt+1' })], overrides);

    expect(row.effectiveChord).toBe('ctrl+1');
    expect(row.isOverridden).toBe(true);
    expect(row.binding.chord).toBe('alt+1');
  });

  it('derives the hazard from the EFFECTIVE chord, not the declared one, so rebinding into a hazardous chord surfaces it', () => {
    const overrides: KeymapOverrides = { 'test.command': 'ctrl+0' };
    const [row] = resolveKeymapPanelRows([buildBinding({ chord: 'alt+1' })], overrides);

    expect(row.hazard).toBe('browser-zoom');
  });

  it('carries no hazard for a chord outside the zoom family', () => {
    const [row] = resolveKeymapPanelRows([buildBinding({ chord: 'alt+1' })], {});

    expect(row.hazard).toBeNull();
  });

  it('attaches no scope note for a global binding and the Notification Center note for a scoped one', () => {
    const [globalRow, scopedRow] = resolveKeymapPanelRows(
      [buildBinding({ scope: 'global' }), buildBinding({ id: 'scoped', scope: 'notification-center' })],
      {},
    );

    expect(globalRow.scopeNote).toBeNull();
    expect(scopedRow.scopeNote).toBe('while the Notification Center is open');
  });

  it('returns an empty array for an empty binding list', () => {
    expect(resolveKeymapPanelRows([], {})).toEqual([]);
  });
});
