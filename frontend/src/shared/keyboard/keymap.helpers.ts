import { BROWSER_ZOOM_CHORDS, KEYMAP_DOCUMENT_VERSION } from './keymap.constants';
import type { Chord, CommandBinding } from './keyboard.types';
import type { ChordHazard, KeymapDocument, KeymapOverrides } from './keymap.types';

/**
 * The chord a binding actually answers to: the user's override if any, else
 * its declared chord (design D2). This is the single lookup rule every
 * resolving surface -- the dispatcher, the `?` overlay, the Settings panel
 * -- must share, so there is exactly one place that decides what an
 * override means.
 */
export function effectiveChord(binding: CommandBinding, overrides: KeymapOverrides): Chord {
  return overrides[binding.id] ?? binding.chord;
}

/**
 * The same resolution rule as `effectiveChord`, materialized as rewritten
 * bindings for display and conflict checking (design D2). Implemented in
 * terms of `effectiveChord` rather than duplicating the lookup, so the two
 * can never disagree. Returns the original binding reference when its
 * chord is unchanged, sparing a needless copy on the (common) unbound case.
 */
export function resolveKeymap<T extends CommandBinding>(
  bindings: readonly T[],
  overrides: KeymapOverrides,
): readonly T[] {
  return bindings.map((binding) => {
    const chord = effectiveChord(binding, overrides);
    return chord === binding.chord ? binding : { ...binding, chord };
  });
}

/**
 * Whether `value` is a plain JSON object -- not `null`, not an array. Named
 * so `parseKeymap`'s degrade matrix reads as one check per malformed shape
 * rather than a repeated three-part condition.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses a persisted keymap document into overrides, degrading to `{}` on
 * any malformed shape -- invalid JSON, not an object, a mismatched
 * `version`, a missing or non-object `bindings`, or any non-string chord
 * value -- rather than throwing or partially applying it (design D4, spec
 * "The Keymap Document Is Versioned And Degrades Safely"). The empty string
 * means "no document was ever saved," which resolves identically to an
 * explicitly empty one: `JSON.parse('')` throws, caught below like any
 * other unparseable input, with no separate fast path needed for it.
 */
export function parseKeymap(raw: string): KeymapOverrides {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // `parsed` stays at its declared-but-unassigned default of `undefined`,
    // which the checks below degrade to `{}` exactly like any other
    // malformed shape -- one exit path for "not a usable document", not two
    // that could drift.
  }

  if (!isPlainObject(parsed) || parsed.version !== KEYMAP_DOCUMENT_VERSION) {
    return {};
  }

  const { bindings } = parsed;
  if (!isPlainObject(bindings)) {
    return {};
  }

  const entries = Object.entries(bindings);
  if (entries.some(([, chord]) => typeof chord !== 'string')) {
    return {};
  }

  return Object.fromEntries(entries) as KeymapOverrides;
}

/**
 * Serializes overrides for persistence. An empty override set serializes to
 * `''`, which clears the stored row instead of persisting an empty document
 * -- `SetKeymap("")` is Go's own escape hatch back to shipped defaults
 * (design D4/D5).
 */
export function serializeKeymap(overrides: KeymapOverrides): string {
  if (Object.keys(overrides).length === 0) {
    return '';
  }

  const document: KeymapDocument = { version: KEYMAP_DOCUMENT_VERSION, bindings: overrides };
  return JSON.stringify(document);
}

/**
 * Drops overrides that no longer do anything: an id absent from `bindings`
 * (orphaned by a removed or renamed command) and a no-op override whose
 * chord already equals the command's declared chord. Pruning happens only
 * when the user next saves, never on read (design D4) -- a read must never
 * silently delete an orphan that a later revert of the removing change
 * could make meaningful again.
 */
export function pruneKeymap(overrides: KeymapOverrides, bindings: readonly CommandBinding[]): KeymapOverrides {
  const bindingById = new Map(bindings.map((binding) => [binding.id, binding]));
  const pruned = Object.entries(overrides).filter(([id, chord]) => {
    const binding = bindingById.get(id);
    return binding !== undefined && binding.chord !== chord;
  });
  return Object.fromEntries(pruned);
}

/**
 * A chord's non-blocking delivery risk, derived at display time and never
 * stored (design D9). One family remains: the chords Chromium binds to page
 * zoom, which is the only one with evidence behind it. Everything else
 * resolves to `null`.
 *
 * Design D9 also declared `'unverified-delivery'` over every `alt+` chord.
 * That family is gone, and `ChordHazard` records why: its evidence was that
 * no `alt+` chord had been confirmed in the packaged build, and the owner
 * confirmed eleven of them on 2026-09-11. With one family left there is no
 * precedence left to pin either, which removes the one test that had to
 * mutate `BROWSER_ZOOM_CHORDS` at runtime to force an overlap real data
 * could never produce.
 */
export function findChordHazard(chord: Chord): ChordHazard | null {
  return BROWSER_ZOOM_CHORDS.has(chord) ? 'browser-zoom' : null;
}
