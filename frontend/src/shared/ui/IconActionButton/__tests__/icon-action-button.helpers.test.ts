import { describe, expect, it } from 'vitest';
import { getIconActionToneClass, getIconActionTooltip } from '../icon-action-button.helpers';

describe('getIconActionTooltip', () => {
  it.each([
    { scenario: 'enabled, with a reason', isDisabled: false, reason: 'Set a folder first', expected: 'Re-analyze folder' },
    { scenario: 'disabled, without a reason', isDisabled: true, reason: undefined, expected: 'Re-analyze folder' },
    { scenario: 'disabled, with an empty reason', isDisabled: true, reason: '', expected: 'Re-analyze folder' },
    { scenario: 'disabled, with a reason', isDisabled: true, reason: 'Set a folder first', expected: 'Re-analyze folder · Set a folder first' },
  ])('names the action $scenario', ({ isDisabled, reason, expected }) => {
    expect(getIconActionTooltip('Re-analyze folder', isDisabled, reason)).toBe(expected);
  });
});

describe('getIconActionToneClass', () => {
  it.each([
    { tone: undefined, isTinted: false, expected: undefined },
    { tone: undefined, isTinted: true, expected: undefined },
    { tone: 'accent', isTinted: false, expected: 'hover:text-accent' },
    { tone: 'success', isTinted: false, expected: 'hover:text-success' },
    { tone: 'warning', isTinted: false, expected: 'hover:text-warning' },
    { tone: 'danger', isTinted: false, expected: 'hover:text-danger' },
    { tone: 'accent', isTinted: true, expected: 'text-accent' },
    { tone: 'success', isTinted: true, expected: 'text-success' },
    { tone: 'warning', isTinted: true, expected: 'text-warning' },
    { tone: 'danger', isTinted: true, expected: 'text-danger' },
  ] as const)('tints $tone (tinted: $isTinted) with $expected', ({ tone, isTinted, expected }) => {
    expect(getIconActionToneClass(tone, isTinted)).toBe(expected);
  });
});
