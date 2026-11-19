import { describe, expect, it } from 'vitest';
import { effectiveChord, findChordHazard, parseKeymap, pruneKeymap, resolveKeymap, serializeKeymap } from '../keymap.helpers';
import type { CommandBinding } from '../keyboard.types';
import type { KeymapOverrides } from '../keymap.types';

/** Builds a minimal command binding, overriding only what a case needs. */
function buildBinding(overrides: Partial<CommandBinding> = {}): CommandBinding {
  return {
    id: 'nav.today',
    scope: 'global',
    chord: 'alt+1',
    label: 'Today',
    section: 'Navigation',
    ...overrides,
  };
}

describe('effectiveChord', () => {
  it('resolves to a stored override and keeps the declared chord without one or under a no-op one', () => {
    const binding = buildBinding({ id: 'nav.today', chord: 'alt+1' });
    const cases: ReadonlyArray<readonly [string, KeymapOverrides, string]> = [
      ['stored override', { 'nav.today': 'ctrl+1' }, 'ctrl+1'],
      ['no override', {}, 'alt+1'],
      ['no-op override matching the declared chord verbatim', { 'nav.today': 'alt+1' }, 'alt+1'],
    ];
    for (const [name, overrides, expected] of cases) {
      expect.soft(effectiveChord(binding, overrides), name).toBe(expected);
    }
  });
});

describe('resolveKeymap', () => {
  it('rewrites overridden chords, keeps unchanged references and ignores an override for an absent id', () => {
    const bindings = [buildBinding({ id: 'nav.today', chord: 'alt+1' }), buildBinding({ id: 'nav.editor', chord: 'alt+3' })];
    const binding = buildBinding({ id: 'nav.today', chord: 'alt+1' });
    const todayOnly = [buildBinding({ id: 'nav.today', chord: 'alt+1' })];
    const orphan = resolveKeymap(todayOnly, { 'nav.removed': 'ctrl+9' });

    expect.soft(resolveKeymap(bindings, { 'nav.today': 'ctrl+1' }).map((entry) => entry.chord), 'overridden chord').toEqual(['ctrl+1', 'alt+3']);
    // Same reference when the chord is unchanged, sparing a needless copy.
    expect.soft(resolveKeymap([binding], {})[0], 'unchanged reference').toBe(binding);
    expect.soft(orphan, 'absent id: bindings unchanged').toEqual(todayOnly);
    expect.soft(orphan.some((entry) => entry.chord === 'ctrl+9'), 'absent id: never resurrected').toBe(false);
  });
});

describe('parseKeymap', () => {
  it('parses a valid document and degrades any other document to no overrides without throwing', () => {
    expect.soft(parseKeymap(JSON.stringify({ version: 1, bindings: { 'nav.today': 'ctrl+1' } })), 'valid document').toEqual({ 'nav.today': 'ctrl+1' });
    // The empty string is identical to an explicit empty document.
    expect.soft(parseKeymap(''), 'empty string').toEqual({});
    const invalid: ReadonlyArray<readonly [string, string]> = [
      ['not valid JSON', '{not json'],
      ['a JSON null', 'null'],
      ['a JSON array instead of an object', '[]'],
      ['a mismatched version', JSON.stringify({ version: 2, bindings: { 'nav.today': 'ctrl+1' } })],
      ['bindings that is not an object', JSON.stringify({ version: 1, bindings: 'ctrl+1' })],
      [
        'bindings mixing one valid string chord with one non-string chord',
        JSON.stringify({ version: 1, bindings: { 'nav.today': 'ctrl+1', 'nav.editor': 7 } }),
      ],
    ];
    for (const [name, raw] of invalid) {
      expect.soft(() => parseKeymap(raw), `${name}: does not throw`).not.toThrow();
      expect.soft(parseKeymap(raw), `${name}: no overrides`).toEqual({});
    }
  });
});

describe('serializeKeymap', () => {
  it('serializes no overrides to the empty string and round-trips a non-empty set through parseKeymap', () => {
    const overrides: KeymapOverrides = { 'nav.today': 'ctrl+1', 'nav.editor': 'ctrl+3' };
    const serialized = serializeKeymap(overrides);

    // The empty string clears the stored row.
    expect.soft(serializeKeymap({}), 'empty set').toBe('');
    expect.soft(serialized, 'non-empty set').not.toBe('');
    expect.soft(parseKeymap(serialized), 'round trip').toEqual(overrides);
  });
});

describe('pruneKeymap', () => {
  it('drops orphan and no-op overrides and keeps a real one', () => {
    const today = [buildBinding({ id: 'nav.today', chord: 'alt+1' })];
    const both = [buildBinding({ id: 'nav.today', chord: 'alt+1' }), buildBinding({ id: 'nav.editor', chord: 'alt+3' })];
    const cases: ReadonlyArray<readonly [string, KeymapOverrides, CommandBinding[], KeymapOverrides]> = [
      ['override naming an absent id', { 'nav.removed': 'ctrl+9' }, today, {}],
      ['no-op override equal to the declared chord', { 'nav.today': 'alt+1' }, today, {}],
      ['real override of a known id', { 'nav.today': 'ctrl+1' }, today, { 'nav.today': 'ctrl+1' }],
      ['orphan, no-op and real override in one document', { 'nav.today': 'ctrl+1', 'nav.editor': 'alt+3', 'nav.removed': 'ctrl+9' }, both, { 'nav.today': 'ctrl+1' }],
    ];
    for (const [name, overrides, bindings, expected] of cases) {
      expect.soft(pruneKeymap(overrides, bindings), name).toEqual(expected);
    }
  });
});

describe('findChordHazard', () => {
  it('flags exactly the browser-zoom chords and no proven or other ctrl chord', () => {
    // Written as literals, not as `[...BROWSER_ZOOM_CHORDS]`: deriving the
    // cases from the set under test means removing a member silently removes
    // its coverage, which is the shape of guard-deleted test this repo has
    // already been burned by three times.
    for (const chord of ['ctrl+0', 'ctrl+numpad0', 'ctrl++', 'ctrl+=', 'ctrl+-', 'ctrl+numpadadd', 'ctrl+numpadsubtract']) {
      expect.soft(findChordHazard(chord), `zoom chord ${chord}`).toBe('browser-zoom');
    }
    // Every one of these was validated in the packaged app on 2026-09-11, so
    // none of them is a hazard. This is the case that would have failed under
    // the dropped `unverified-delivery` family, and it is here to keep that
    // family from coming back without evidence.
    for (const chord of ['alt+1', 'alt+0', 'alt+r', 'alt+shift+1', '?']) {
      expect.soft(findChordHazard(chord), `proven chord ${chord}`).toBeNull();
    }
    // A ctrl chord that is not a zoom chord: the family is a set membership, not a ctrl prefix.
    expect.soft(findChordHazard('ctrl+9'), 'non-zoom ctrl chord').toBeNull();
  });
});
