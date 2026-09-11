import { CHORD_MODIFIER_ORDER, DIGIT_CODE_PATTERN, MODIFIER_ONLY_KEYS, NUMPAD_CODE_PATTERN } from './keyboard.constants';
import type { Chord } from './keyboard.types';

/**
 * The subset of `KeyboardEvent` chord normalization actually reads. Narrowed
 * on purpose so tests can build plain literal objects: a real `KeyboardEvent`
 * satisfies this structurally, so production call sites need no cast either.
 */
export type ChordSourceEvent = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>;

/**
 * Resolves the un-prefixed key token per D7's branch order: the digit row by
 * physical position first, then a modifier-alone press (which yields no
 * chord at all), then the numeric keypad by its own physical position, then
 * `event.key` itself — lowercased, whether it names a multi-character key or
 * a single printable character.
 */
function resolveKeyToken(event: ChordSourceEvent): string | null {
  const digitMatch = DIGIT_CODE_PATTERN.exec(event.code);
  if (digitMatch !== null) {
    return digitMatch[1];
  }

  if (MODIFIER_ONLY_KEYS.has(event.key)) {
    return null;
  }

  if (NUMPAD_CODE_PATTERN.test(event.code)) {
    return event.code.toLowerCase();
  }

  return event.key.toLowerCase();
}

/**
 * Whether `shift+` belongs in the final chord. Digits, named keys and
 * alphabetic characters never encode Shift in their own token, so the flag is
 * the only signal there. A single non-alphabetic character is the sole
 * exception: the browser already produced the shifted character in
 * `event.key` (Shift+/ arrives as `?` on a US layout), so prefixing `shift+`
 * on top of it would double-count the modifier and split what is one
 * physical chord into two different normalized strings across layouts (D7).
 */
function shouldKeepShift(event: ChordSourceEvent, keyToken: string, isDigitToken: boolean): boolean {
  if (!event.shiftKey) {
    return false;
  }

  if (isDigitToken) {
    return true;
  }

  const isSingleNonAlphabetic = keyToken.length === 1 && !/[a-z]/i.test(keyToken);
  return !isSingleNonAlphabetic;
}

/**
 * Normalizes a `KeyboardEvent` to one canonical chord string, or `null` when
 * the event carries no chord (a modifier pressed alone). Pure: it reads only
 * its argument and touches no shared state (spec "Chord Normalization And
 * Display Formatting Are Pure Functions").
 */
export function normalizeChord(event: ChordSourceEvent): Chord | null {
  const isDigitToken = DIGIT_CODE_PATTERN.test(event.code);
  const keyToken = resolveKeyToken(event);
  if (keyToken === null) {
    return null;
  }

  const keepShift = shouldKeepShift(event, keyToken, isDigitToken);
  const modifierFlags: Readonly<Record<(typeof CHORD_MODIFIER_ORDER)[number], boolean>> = {
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: keepShift,
    meta: event.metaKey,
  };
  const prefix = CHORD_MODIFIER_ORDER.filter((modifier) => modifierFlags[modifier])
    .map((modifier) => `${modifier}+`)
    .join('');

  return `${prefix}${keyToken}`;
}

/**
 * Formats a canonical chord string for the help dialog, e.g. `ctrl+k` ->
 * `Ctrl + K`. It is the inverse of `normalizeChord`'s shape, not its exact
 * behaviour: it renders a chord that already exists, it never re-derives one
 * from an event. Title-casing every part (`charAt(0)` upper + the rest as
 * -is) also covers a single-character part correctly, since `slice(1)` of a
 * length-1 string is empty — there is no separate "just uppercase it" case.
 */
export function formatChord(chord: Chord): string {
  return chord
    .split('+')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' + ');
}
