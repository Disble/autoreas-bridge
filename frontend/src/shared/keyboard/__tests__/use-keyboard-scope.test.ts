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
  it('pushes exactly one frame on mount and pops it on unmount', () => {
    const { unmount } = renderHook(() => useKeyboardScope({ scope: 'notification-center', commands: [buildCommand()] }));

    expect(getKeyboardState().frames).toHaveLength(1);

    unmount();

    expect(getKeyboardState().frames).toHaveLength(0);
  });

  it('gives two concurrently mounted consumers distinct, sequential frame ids', () => {
    renderHook(() => useKeyboardScope({ scope: 'notification-center', commands: [buildCommand()] }));
    renderHook(() => useKeyboardScope({ scope: 'notification-center', commands: [buildCommand()] }));

    const [firstId, secondId] = getKeyboardState().frames.map((frame) => frame.id);
    expect(secondId).toBe((firstId ?? 0) + 1);
  });

  it('refreshes the commands a mounted frame reads, without pushing a second frame, when the caller re-renders with new commands', () => {
    const firstCommands = [buildCommand({ id: 'first' })];
    const secondCommands = [buildCommand({ id: 'second' })];
    const { rerender } = renderHook(({ commands }) => useKeyboardScope({ scope: 'notification-center', commands }), {
      initialProps: { commands: firstCommands },
    });

    rerender({ commands: secondCommands });

    expect(getKeyboardState().frames).toHaveLength(1);
    expect(getKeyboardState().frames[0]?.getCommands()).toBe(secondCommands);
  });

  it('re-pushes under the new scope when the caller re-renders with a different scope', () => {
    const { rerender } = renderHook(({ scope }: { scope: KeyboardScope }) => useKeyboardScope({ scope, commands: [buildCommand()] }), {
      initialProps: { scope: 'global' },
    });

    rerender({ scope: 'notification-center' });

    expect(getKeyboardState().frames).toHaveLength(1);
    expect(getKeyboardState().frames[0]?.scope).toBe('notification-center');
  });
});
