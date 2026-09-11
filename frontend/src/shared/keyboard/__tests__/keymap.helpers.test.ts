import { describe, expect, it } from 'vitest';
import { effectiveChord, parseKeymap, pruneKeymap, resolveKeymap, serializeKeymap } from '../keymap.helpers';
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
  it('resolves to the stored override when the binding id has one', () => {
    const binding = buildBinding({ id: 'nav.today', chord: 'alt+1' });
    const overrides: KeymapOverrides = { 'nav.today': 'ctrl+1' };

    expect(effectiveChord(binding, overrides)).toBe('ctrl+1');
  });

  it('keeps the declared chord when the binding id has no override', () => {
    const binding = buildBinding({ id: 'nav.today', chord: 'alt+1' });

    expect(effectiveChord(binding, {})).toBe('alt+1');
  });

  it('keeps the declared chord when a no-op override matches it verbatim', () => {
    const binding = buildBinding({ id: 'nav.today', chord: 'alt+1' });
    const overrides: KeymapOverrides = { 'nav.today': 'alt+1' };

    expect(effectiveChord(binding, overrides)).toBe('alt+1');
  });
});

describe('resolveKeymap', () => {
  it('rewrites the chord of every binding that has a stored override', () => {
    const bindings = [buildBinding({ id: 'nav.today', chord: 'alt+1' }), buildBinding({ id: 'nav.editor', chord: 'alt+3' })];
    const overrides: KeymapOverrides = { 'nav.today': 'ctrl+1' };

    const resolved = resolveKeymap(bindings, overrides);

    expect(resolved.map((binding) => binding.chord)).toEqual(['ctrl+1', 'alt+3']);
  });

  it('returns the same binding reference when its chord is unchanged, sparing a needless copy', () => {
    const binding = buildBinding({ id: 'nav.today', chord: 'alt+1' });

    const [resolved] = resolveKeymap([binding], {});

    expect(resolved).toBe(binding);
  });

  it('never resurrects a match for an override naming an id absent from the bindings array', () => {
    const bindings = [buildBinding({ id: 'nav.today', chord: 'alt+1' })];
    const overrides: KeymapOverrides = { 'nav.removed': 'ctrl+9' };

    const resolved = resolveKeymap(bindings, overrides);

    expect(resolved).toEqual(bindings);
    expect(resolved.some((binding) => binding.chord === 'ctrl+9')).toBe(false);
  });
});

describe('parseKeymap', () => {
  it('parses a valid document into its overrides', () => {
    const raw = JSON.stringify({ version: 1, bindings: { 'nav.today': 'ctrl+1' } });

    expect(parseKeymap(raw)).toEqual({ 'nav.today': 'ctrl+1' });
  });

  it('treats the empty string as no overrides, identical to an explicit empty document', () => {
    expect(parseKeymap('')).toEqual({});
  });

  it.each<[string, string]>([
    ['not valid JSON', '{not json'],
    ['a JSON null', 'null'],
    ['a JSON array instead of an object', '[]'],
    ['a mismatched version', JSON.stringify({ version: 2, bindings: { 'nav.today': 'ctrl+1' } })],
    ['bindings missing entirely', JSON.stringify({ version: 1 })],
    ['bindings that is not an object', JSON.stringify({ version: 1, bindings: 'ctrl+1' })],
    ['a non-string chord value', JSON.stringify({ version: 1, bindings: { 'nav.today': 7 } })],
    [
      'bindings mixing one valid string chord with one non-string chord',
      JSON.stringify({ version: 1, bindings: { 'nav.today': 'ctrl+1', 'nav.editor': 7 } }),
    ],
  ])('degrades to no overrides and does not throw when the document is %s', (_description, raw) => {
    expect(() => parseKeymap(raw)).not.toThrow();
    expect(parseKeymap(raw)).toEqual({});
  });
});

describe('serializeKeymap', () => {
  it('serializes an empty override set to the empty string, which clears the stored row', () => {
    expect(serializeKeymap({})).toBe('');
  });

  it('round-trips a non-empty override set through parseKeymap unchanged', () => {
    const overrides: KeymapOverrides = { 'nav.today': 'ctrl+1', 'nav.editor': 'ctrl+3' };

    const serialized = serializeKeymap(overrides);

    expect(serialized).not.toBe('');
    expect(parseKeymap(serialized)).toEqual(overrides);
  });
});

describe('pruneKeymap', () => {
  it('drops an override naming an id absent from the bindings array', () => {
    const bindings = [buildBinding({ id: 'nav.today', chord: 'alt+1' })];
    const overrides: KeymapOverrides = { 'nav.removed': 'ctrl+9' };

    expect(pruneKeymap(overrides, bindings)).toEqual({});
  });

  it('drops a no-op override whose chord already equals the declared chord', () => {
    const bindings = [buildBinding({ id: 'nav.today', chord: 'alt+1' })];
    const overrides: KeymapOverrides = { 'nav.today': 'alt+1' };

    expect(pruneKeymap(overrides, bindings)).toEqual({});
  });

  it('keeps a real override that names a known id and differs from the declared chord', () => {
    const bindings = [buildBinding({ id: 'nav.today', chord: 'alt+1' })];
    const overrides: KeymapOverrides = { 'nav.today': 'ctrl+1' };

    expect(pruneKeymap(overrides, bindings)).toEqual({ 'nav.today': 'ctrl+1' });
  });

  it('prunes orphans and no-ops while keeping a real override, all in one document', () => {
    const bindings = [buildBinding({ id: 'nav.today', chord: 'alt+1' }), buildBinding({ id: 'nav.editor', chord: 'alt+3' })];
    const overrides: KeymapOverrides = {
      'nav.today': 'ctrl+1',
      'nav.editor': 'alt+3',
      'nav.removed': 'ctrl+9',
    };

    expect(pruneKeymap(overrides, bindings)).toEqual({ 'nav.today': 'ctrl+1' });
  });
});
