import type { Chord } from './keyboard.types';

/**
 * User-owned chord per command id. An id absent here keeps its declared
 * chord (design D2/D4) -- the resolution rule needs no entry for a command
 * that was never rebound.
 */
export type KeymapOverrides = Readonly<Record<string, Chord>>;

/**
 * The persisted keymap document. `version` exists so a future chord-format
 * change can migrate an old document instead of guessing at its shape
 * (design D4). `1` is the only version this change ever produces or reads.
 */
export interface KeymapDocument {
  readonly version: 1;
  readonly bindings: KeymapOverrides;
}

/**
 * A non-blocking signal about a chord's real-world delivery risk, derived at
 * display time by `findChordHazard` and never stored (design D9). A chord
 * with no known or suspected risk resolves to `null`, not to a member of
 * this union.
 *
 * Design D9 declared a second member, `'unverified-delivery'`, over every
 * `alt+` chord, on the evidence that nobody had confirmed one reaching the
 * packaged build. That evidence expired the same day: the repository owner
 * validated `alt+1`..`alt+0` and `alt+r` in the packaged app on 2026-09-11,
 * so a blanket `alt+` hazard would now mark eleven proven chords as
 * unproven. It is dropped rather than narrowed, because the narrower thing
 * it should become -- the chords Windows genuinely reserves -- has no
 * verified list here, and inventing one would assert exactly what the
 * evidence-backed zoom family refuses to assert. Bringing a warning back
 * needs that list verified first; ADR-020, written in the documentation
 * slice, is where the open question lands.
 */
export type ChordHazard = 'browser-zoom';

/**
 * A chord claimed by commands in more than one scope. The scoped claimants
 * win while their scope is mounted (`resolveCommand`'s innermost-first
 * rule), so this is a non-blocking warning, never a `findDuplicateBindings`
 * collision -- the two group by different keys and can never both fire for
 * the same candidate (design D8).
 */
export interface ShadowedBinding {
  readonly chord: Chord;
  readonly scopedIds: readonly string[];
  readonly globalIds: readonly string[];
}
