import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AnimeEditorLifecycleAction } from '../anime-editor-workspace.types';
import { useAnimeEditorLifecycleConfirmation } from '../use-anime-editor-lifecycle-confirmation';

/**
 * Renders the hook over three resolved lifecycle commands.
 * @returns The rendered hook and its commands.
 */
function renderConfirmation() {
  const commands = { onDeactivate: vi.fn(() => Promise.resolve()), onRestore: vi.fn(() => Promise.resolve()), onRepeat: vi.fn(() => Promise.resolve()) };
  const { result } = renderHook(() => useAnimeEditorLifecycleConfirmation(commands));
  return { result, commands };
}

describe('useAnimeEditorLifecycleConfirmation', () => {
  it.each([
    ['deactivate', 'onDeactivate'],
    ['restore', 'onRestore'],
    ['repeat', 'onRepeat'],
  ] as const)('asks to confirm %s, then runs only %s and closes the dialog', async (action: AnimeEditorLifecycleAction, command) => {
    const { result, commands } = renderConfirmation();
    expect(result.current.lifecycleConfirmation).toBeUndefined();

    act(() => result.current.onRequestLifecycleAction(action));
    expect(result.current.lifecycleConfirmation?.action).toBe(action);

    await act(() => result.current.onConfirmLifecycleAction());
    expect(result.current.lifecycleConfirmation).toBeUndefined();
    expect(commands[command]).toHaveBeenCalledTimes(1);
    expect(Object.values(commands).reduce((total, run) => total + run.mock.calls.length, 0)).toBe(1);
  });

  it('closes the dialog on cancel without running a command', async () => {
    const { result, commands } = renderConfirmation();

    act(() => result.current.onRequestLifecycleAction('deactivate'));
    act(() => result.current.onCancelLifecycleAction());
    expect(result.current.lifecycleConfirmation).toBeUndefined();
    await act(() => result.current.onConfirmLifecycleAction());
    expect(commands.onDeactivate).not.toHaveBeenCalled();
    expect(commands.onRestore).not.toHaveBeenCalled();
    expect(commands.onRepeat).not.toHaveBeenCalled();
  });
});
