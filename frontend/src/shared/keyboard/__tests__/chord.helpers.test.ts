import { describe, expect, it } from 'vitest';
import { formatChord, normalizeChord } from '../chord.helpers';
import type { ChordSourceEvent } from '../chord.helpers';

/**
 * Baseline chord-normalizable event every case overrides from. Represents an
 * unmodified `KeyD` press with no modifier held, so each test states only
 * what actually differs.
 */
const baseEvent: ChordSourceEvent = {
  key: 'd',
  code: 'KeyD',
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
};

describe('normalizeChord', () => {
  it('normalizes Ctrl+K to one canonical chord string', () => {
    expect(normalizeChord({ ...baseEvent, key: 'k', code: 'KeyK', ctrlKey: true })).toBe('ctrl+k');
  });

  it('normalizes Alt+1 from a US layout digit-row key by its physical position', () => {
    expect(normalizeChord({ ...baseEvent, key: '1', code: 'Digit1', altKey: true })).toBe('alt+1');
  });

  it('normalizes Alt+1 from an AZERTY digit-row key the same way, ignoring the shifted character', () => {
    expect(normalizeChord({ ...baseEvent, key: '&', code: 'Digit1', altKey: true })).toBe('alt+1');
  });

  it('normalizes Shift+/ on a US layout to ?, taking the already-shifted character verbatim', () => {
    expect(normalizeChord({ ...baseEvent, key: '?', code: 'Slash', shiftKey: true })).toBe('?');
  });

  it('normalizes Shift+, on an AZERTY layout to the same ? chord Shift+/ produces on US', () => {
    expect(normalizeChord({ ...baseEvent, key: '?', code: 'Comma', shiftKey: true })).toBe('?');
  });

  it('normalizes Alt+Shift+R to alt+shift+r, distinct from plain Alt+R', () => {
    expect(normalizeChord({ ...baseEvent, key: 'R', code: 'KeyR', altKey: true, shiftKey: true })).toBe('alt+shift+r');
  });

  it('normalizes plain Alt+R to alt+r', () => {
    expect(normalizeChord({ ...baseEvent, key: 'r', code: 'KeyR', altKey: true })).toBe('alt+r');
  });

  it('normalizes a bare Shift press with no companion key to null', () => {
    expect(normalizeChord({ ...baseEvent, key: 'Shift', code: 'ShiftLeft', shiftKey: true })).toBeNull();
  });

  it('normalizes Numpad1 to a token distinct from the digit row, never colliding with plain 1', () => {
    expect(normalizeChord({ ...baseEvent, key: '1', code: 'Numpad1' })).toBe('numpad1');
  });

  it('keeps shift for a digit-row chord, since the digit token never encodes Shift on its own', () => {
    expect(normalizeChord({ ...baseEvent, key: '!', code: 'Digit1', altKey: true, shiftKey: true })).toBe(
      'alt+shift+1',
    );
  });

  it('keeps shift for a multi-character, non-alphabetic key token', () => {
    // `+-` is synthetic: every real DOM named key (ArrowDown, Escape, ...) is an
    // English word and therefore alphabetic, so this pins the length check in
    // `shouldKeepShift` on its own terms rather than relying on that coincidence.
    expect(normalizeChord({ ...baseEvent, key: '+-', shiftKey: true })).toBe('shift++-');
  });
});

describe('formatChord', () => {
  it('formats the Ctrl+K chord as a human-readable string, round-tripping normalizeChord', () => {
    const chord = normalizeChord({ ...baseEvent, key: 'k', code: 'KeyK', ctrlKey: true });

    expect(chord).not.toBeNull();
    expect(formatChord(chord as string)).toBe('Ctrl + K');
  });
});
