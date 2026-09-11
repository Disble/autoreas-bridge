import { createStore } from 'zustand/vanilla';
import type { KeyboardStoreState } from './keyboard.types';

/**
 * Canonical modifier ordering a chord string is built and matched against:
 * `ctrl+alt+shift+meta+<key>` (D8). `chord.helpers.ts` reads this so the
 * order is declared once instead of repeated at every call site.
 */
export const CHORD_MODIFIER_ORDER = ['ctrl', 'alt', 'shift', 'meta'] as const;

/**
 * `event.key` values reporting a modifier held alone, with no companion key
 * (D7 branch 2). Lives here, not in `chord.helpers.ts`, because
 * `dharness/role-file-shape` reserves `.helpers` for types and functions —
 * a plain `Set` is a value.
 */
export const MODIFIER_ONLY_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph']);

/** Matches the digit row by physical position, independent of the shifted character a layout produces (D7 branch 1). */
export const DIGIT_CODE_PATTERN = /^Digit([0-9])$/;

/**
 * Matches the numeric keypad by physical position. Checked after the digit
 * row and the modifier-alone guard so a keypad digit never falls through to
 * `event.key` and collides with the digit row's own token (D7 "numeric
 * keypad" row: `Numpad1` normalizes distinctly from `Digit1`, not to `'1'`).
 */
export const NUMPAD_CODE_PATTERN = /^Numpad/;

/**
 * Vanilla backing store for the shared keyboard read-model. It lives in the
 * constants file rather than beside its helpers because
 * `dharness/role-file-shape` reserves `.helpers` for functions — the same
 * shape `notification-store.constants.ts` uses (D4).
 */
export const keyboardStore = createStore<KeyboardStoreState>()(() => ({
  frames: [],
  isHelpOpen: false,
}));
