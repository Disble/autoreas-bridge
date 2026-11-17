import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsSource } from '../../contracts/settings.types';
import { createBridgeError } from '../../query/bridge-error/bridge-error.helpers';
import { getKeyboardState, resetKeyboardStore } from '../keyboard-scope.helpers';
import { loadKeymapOverrides } from '../keymap-load.helpers';

/** Builds a minimal injectable source stubbing only `getKeymap`, the sole method this helper reads. */
function buildSource(getKeymap: () => Promise<string>): Pick<SettingsSource, 'getKeymap'> {
  return { getKeymap };
}

/** A settings module that is already ready. */
const settingsReady = () => Promise.resolve();

beforeEach(resetKeyboardStore);
afterEach(resetKeyboardStore);

describe('loadKeymapOverrides', () => {
  it("resolves an empty document ('') to no overrides, loaded", async () => {
    await loadKeymapOverrides(buildSource(() => Promise.resolve('')), settingsReady);

    expect(getKeyboardState().keymapLoadState).toBe('loaded');
    expect(getKeyboardState().overrides).toEqual({});
  });

  it('resolves a valid serialized document to its overrides', async () => {
    const document = JSON.stringify({ version: 1, bindings: { 'nav.today': 'ctrl+1' } });

    await loadKeymapOverrides(buildSource(() => Promise.resolve(document)), settingsReady);

    expect(getKeyboardState().keymapLoadState).toBe('loaded');
    expect(getKeyboardState().overrides).toEqual({ 'nav.today': 'ctrl+1' });
  });

  it('reports a garbage document as LOADED, not failed: it arrived fine and parseKeymap degraded its contents', async () => {
    await loadKeymapOverrides(buildSource(() => Promise.resolve('{not json: alt++')), settingsReady);

    expect(getKeyboardState().keymapLoadState).toBe('loaded');
    expect(getKeyboardState().overrides).toEqual({});
  });

  it('reports a REJECTED read as failed, which is what earns the panel its error state rather than an empty one', async () => {
    await loadKeymapOverrides(buildSource(() => Promise.reject(createBridgeError('internal', 'settings disk I/O error'))), settingsReady);

    expect(getKeyboardState().keymapLoadState).toBe('failed');
    // Still published as no overrides rather than left pending: a failed read
    // must never strand the dispatcher, so the shortcuts keep working on
    // their declared chords while the panel reports the failure.
    expect(getKeyboardState().overrides).toEqual({});
  });

  it('stays pending without reading while the settings module starts, then loads once it is ready', async () => {
    let markReady = () => {};
    const getKeymap = vi.fn().mockResolvedValue(JSON.stringify({ version: 1, bindings: { 'nav.today': 'ctrl+1' } }));
    const load = loadKeymapOverrides(buildSource(getKeymap), () => new Promise<void>((resolve) => (markReady = resolve)));
    await Promise.resolve();

    expect(getKeymap).not.toHaveBeenCalled();
    expect(getKeyboardState().keymapLoadState).toBe('pending');

    markReady();
    await load;
    expect(getKeyboardState().keymapLoadState).toBe('loaded');
    expect(getKeyboardState().overrides).toEqual({ 'nav.today': 'ctrl+1' });
  });

  it('reports a failed settings module as failed without reading the keymap', async () => {
    const getKeymap = vi.fn().mockResolvedValue('');

    await loadKeymapOverrides(buildSource(getKeymap), () => Promise.reject(createBridgeError('failed_precondition', 'settings failed to start')));

    expect(getKeymap).not.toHaveBeenCalled();
    expect(getKeyboardState().keymapLoadState).toBe('failed');
  });
});
