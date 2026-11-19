import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getKeyboardState, resetKeyboardStore } from '../keyboard-scope.helpers';
import type { CommandDefinition, KeyboardScope } from '../keyboard.types';
import { useKeyboardScope } from '../use-keyboard-scope';

/** Builds a minimal command definition, overriding only what a case needs. */
function buildCommand(overrides: Partial<CommandDefinition> = {}): CommandDefinition {
  return { id: 'test.command', scope: 'global', chord: 'alt+1', label: 'Test', section: 'Navigation', run: () => undefined, ...overrides };
}

beforeEach(resetKeyboardStore);
afterEach(resetKeyboardStore);

describe('useKeyboardScope', () => {
  it('keeps one frame across new commands and a new scope, numbers a second consumer next, and pops on unmount', () => {
    const firstCommands = [buildCommand({ id: 'first' })];
    const secondCommands = [buildCommand({ id: 'second' })];
    const first = renderHook(({ scope, commands }: { scope: KeyboardScope; commands: CommandDefinition[] }) => useKeyboardScope({ scope, commands }), {
      initialProps: { scope: 'global', commands: firstCommands },
    });

    expect(getKeyboardState().frames).toHaveLength(1);

    first.rerender({ scope: 'global', commands: secondCommands });

    expect(getKeyboardState().frames).toHaveLength(1);
    expect(getKeyboardState().frames[0]?.getCommands()).toBe(secondCommands);

    first.rerender({ scope: 'notification-center', commands: secondCommands });

    expect(getKeyboardState().frames).toHaveLength(1);
    expect(getKeyboardState().frames[0]?.scope).toBe('notification-center');

    const second = renderHook(() => useKeyboardScope({ scope: 'notification-center', commands: [buildCommand()] }));

    const [firstId, secondId] = getKeyboardState().frames.map((frame) => frame.id);
    expect(secondId).toBe((firstId ?? 0) + 1);

    first.unmount();

    expect(getKeyboardState().frames).toHaveLength(1);

    second.unmount();

    expect(getKeyboardState().frames).toHaveLength(0);
  });
});
