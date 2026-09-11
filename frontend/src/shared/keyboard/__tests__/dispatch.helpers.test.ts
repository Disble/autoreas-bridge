import { beforeEach, describe, expect, it, vi } from 'vitest';
import { popKeyboardScopeFrame, pushKeyboardScopeFrame, resetKeyboardStore } from '../keyboard-scope.helpers';
import { dispatchKeyboardEvent, isTypingTarget, resolveCommand } from '../dispatch.helpers';
import type { KeyboardDispatchEvent } from '../dispatch.helpers';
import type { CommandDefinition, KeyboardScopeFrame } from '../keyboard.types';

/** Builds a minimal command definition for resolveCommand/dispatch tests, overriding only what a case needs. */
function buildCommand(overrides: Partial<CommandDefinition> = {}): CommandDefinition {
  return {
    id: 'test.command',
    scope: 'global',
    chord: 'alt+1',
    label: 'Test',
    section: 'Navigation',
    run: () => {},
    ...overrides,
  };
}

/** Builds a minimal scope frame carrying exactly the given commands. */
function buildFrame(id: number, commands: readonly CommandDefinition[]): KeyboardScopeFrame {
  return { id, scope: 'notification-center', getCommands: () => commands };
}

/**
 * Baseline dispatchable event every case overrides from: a plain `d` key
 * press with no modifier, bound to no command in `KEYBOARD_COMMANDS`, so
 * single-guard tests don't also have to reason about resolution.
 */
const baseEvent: KeyboardDispatchEvent = {
  key: 'd',
  code: 'KeyD',
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  defaultPrevented: false,
  isComposing: false,
  target: null,
  preventDefault: () => {},
};

beforeEach(() => {
  resetKeyboardStore();
});

describe('isTypingTarget', () => {
  it('treats an <input>-shaped target as typing', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
  });

  it('treats a <textarea>-shaped target as typing', () => {
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
  });

  it('treats a contenteditable-shaped target as typing', () => {
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('treats a role="textbox"-shaped target as typing', () => {
    expect(isTypingTarget({ tagName: 'DIV', getAttribute: (name) => (name === 'role' ? 'textbox' : null) })).toBe(true);
  });

  it('does not treat a plain non-editable element as typing', () => {
    expect(isTypingTarget({ tagName: 'DIV', getAttribute: () => null })).toBe(false);
  });

  it('does not treat a target with no getAttribute method as typing, and does not throw', () => {
    expect(isTypingTarget({ tagName: 'DIV' })).toBe(false);
  });

  it('does not treat a null target as typing', () => {
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('resolveCommand', () => {
  it('resolves from the global registry when no frame is on the stack', () => {
    const globalCommand = buildCommand({ id: 'global.one', chord: 'alt+1' });

    expect(resolveCommand('alt+1', [], [globalCommand])).toBe(globalCommand);
  });

  it('returns null for a chord no frame or the global registry declares', () => {
    const globalCommand = buildCommand({ id: 'global.one', chord: 'alt+1' });

    expect(resolveCommand('ctrl+z', [], [globalCommand])).toBeNull();
  });

  it('resolves the innermost frame first when two frames both declare the chord', () => {
    const outerCommand = buildCommand({ id: 'outer.one', chord: 'alt+r' });
    const innerCommand = buildCommand({ id: 'inner.one', chord: 'alt+r' });
    const outerFrame = buildFrame(1, [outerCommand]);
    const innerFrame = buildFrame(2, [innerCommand]);

    expect(resolveCommand('alt+r', [outerFrame, innerFrame], [])).toBe(innerCommand);
  });

  it('falls back to the global registry when the active frame does not declare the chord', () => {
    const globalCommand = buildCommand({ id: 'global.one', chord: 'alt+9' });
    const frame = buildFrame(1, [buildCommand({ id: 'frame.one', chord: 'alt+r' })]);

    expect(resolveCommand('alt+9', [frame], [globalCommand])).toBe(globalCommand);
  });
});

describe('dispatchKeyboardEvent', () => {
  it('does not run a matched command when event.defaultPrevented is true', () => {
    const run = vi.fn();
    pushKeyboardScopeFrame(buildFrame(1, [buildCommand({ chord: 'alt+r', run })]));

    dispatchKeyboardEvent(
      { ...baseEvent, key: 'r', code: 'KeyR', altKey: true, defaultPrevented: true },
      { navigate: vi.fn() },
    );

    expect(run).not.toHaveBeenCalled();
  });

  it('does not run a matched command when event.isComposing is true', () => {
    const run = vi.fn();
    pushKeyboardScopeFrame(buildFrame(1, [buildCommand({ chord: 'alt+r', run })]));

    dispatchKeyboardEvent({ ...baseEvent, key: 'r', code: 'KeyR', altKey: true, isComposing: true }, { navigate: vi.fn() });

    expect(run).not.toHaveBeenCalled();
  });

  it('does not run a matched command when the focus target is typing-shaped', () => {
    const run = vi.fn();
    pushKeyboardScopeFrame(buildFrame(1, [buildCommand({ chord: 'alt+r', run })]));

    dispatchKeyboardEvent(
      { ...baseEvent, key: 'r', code: 'KeyR', altKey: true, target: { tagName: 'INPUT' } },
      { navigate: vi.fn() },
    );

    expect(run).not.toHaveBeenCalled();
  });

  it('does not run any command for a chord unbound anywhere, frame or global', () => {
    const navigate = vi.fn();

    dispatchKeyboardEvent({ ...baseEvent, key: 'z', code: 'KeyZ', ctrlKey: true }, { navigate });

    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not run any command when the event normalizes to no chord (a modifier pressed alone)', () => {
    const navigate = vi.fn();

    dispatchKeyboardEvent({ ...baseEvent, key: 'Shift', code: 'ShiftLeft', shiftKey: true }, { navigate });

    expect(navigate).not.toHaveBeenCalled();
  });

  it('falls back to the matching global command when the active scope declares no command for the chord (S6)', () => {
    const navigate = vi.fn();
    pushKeyboardScopeFrame(buildFrame(1, [buildCommand({ id: 'frame.only', chord: 'alt+r' })]));

    dispatchKeyboardEvent({ ...baseEvent, key: '1', code: 'Digit1', altKey: true }, { navigate });

    expect(navigate).toHaveBeenCalledWith('/today');
  });

  it('does not run a matched command whose enabled() returns false', () => {
    const run = vi.fn();
    pushKeyboardScopeFrame(buildFrame(1, [buildCommand({ chord: 'alt+r', enabled: () => false, run })]));

    dispatchKeyboardEvent({ ...baseEvent, key: 'r', code: 'KeyR', altKey: true }, { navigate: vi.fn() });

    expect(run).not.toHaveBeenCalled();
  });

  it('does not fall through to a same-chord global command when the scoped one is disabled (S7, D9)', () => {
    const navigate = vi.fn();
    // 'alt+1' is bound globally to /today in KEYBOARD_COMMANDS -- shadow it.
    pushKeyboardScopeFrame(buildFrame(1, [buildCommand({ id: 'scoped.shadow', chord: 'alt+1', enabled: () => false })]));

    dispatchKeyboardEvent({ ...baseEvent, key: '1', code: 'Digit1', altKey: true }, { navigate });

    expect(navigate).not.toHaveBeenCalled();
  });

  it('resolves the global command again once the shadowing scope is popped (S5, completes keyboard-scope.helpers.test.ts)', () => {
    const navigate = vi.fn();
    const frame = buildFrame(1, [buildCommand({ id: 'scoped.shadow', chord: 'alt+1', enabled: () => false })]);
    pushKeyboardScopeFrame(frame);
    popKeyboardScopeFrame(frame.id);

    dispatchKeyboardEvent({ ...baseEvent, key: '1', code: 'Digit1', altKey: true }, { navigate });

    expect(navigate).toHaveBeenCalledWith('/today');
  });

  it('dispatches a bound global chord, preventing default and running its command', () => {
    const navigate = vi.fn();
    const preventDefault = vi.fn();

    dispatchKeyboardEvent({ ...baseEvent, key: '1', code: 'Digit1', altKey: true, preventDefault }, { navigate });

    expect(navigate).toHaveBeenCalledWith('/today');
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('does not bail on a repeated keydown -- event.repeat is not a guard (D12)', () => {
    const navigate = vi.fn();
    const event = { ...baseEvent, key: '1', code: 'Digit1', altKey: true, repeat: true };

    dispatchKeyboardEvent(event, { navigate });

    expect(navigate).toHaveBeenCalledWith('/today');
  });
});
