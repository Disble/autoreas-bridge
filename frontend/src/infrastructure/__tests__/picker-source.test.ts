import { describe, expect, it, vi } from 'vitest';
import { useIsolatedWailsRuntime } from './bridge-runtime-source.test-support';

/**
 * Calls one picker method with a fixed title.
 * @param method The port method.
 * @returns The call's promise.
 */
async function callPicker(method: 'pickFolder' | 'pickFile'): Promise<string> {
  const { createPickerSource } = await import('../picker-source/picker-source.helpers');
  return createPickerSource()[method]('Choose');
}

/** Every picker method with the shell binding it calls. */
const PICKER_CALLS = [
  ['pickFolder', 'PickFolder'],
  ['pickFile', 'PickFile'],
] as const;

describe('picker-source', () => {
  useIsolatedWailsRuntime();

  it.each(PICKER_CALLS)('%s passes the title and resolves the chosen path, "" on a cancel, and rejects a failed dialog with its code, never as a cancel', async (method, binding) => {
    const call = vi.fn()
      .mockResolvedValueOnce('F:/Chosen')
      .mockResolvedValueOnce('')
      .mockRejectedValueOnce(new Error('{"code":"internal","message":"open dialog: crashed"}'));
    window.go = { desktop: { App: { [binding]: call } } } as never;

    await expect(callPicker(method)).resolves.toBe('F:/Chosen');
    expect(call).toHaveBeenCalledExactlyOnceWith('Choose');
    await expect(callPicker(method)).resolves.toBe('');
    await expect(callPicker(method)).rejects.toMatchObject({ name: 'BridgeError', code: 'internal', message: 'open dialog: crashed' });
  });

  it.each(PICKER_CALLS)('%s rejects as unavailable, never a cancel, when its binding never attaches', async (method, binding) => {
    const { WAILS_BINDINGS_TIMEOUT_MS } = await import('../wails-bindings.helpers');

    const assertion = expect(callPicker(method)).rejects.toMatchObject({
      name: 'BridgeError',
      code: 'unavailable',
      message: `the ${binding} binding is not attached`,
    });
    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_TIMEOUT_MS);

    await assertion;
  });
});
