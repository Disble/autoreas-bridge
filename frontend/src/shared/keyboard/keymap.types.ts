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
