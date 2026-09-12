import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PreferencesSource } from '../../../infrastructure/preferences-source/preferences-source.types';
import { getKeyboardState, resetKeyboardStore } from '../keyboard-scope.helpers';
import { loadKeymapOverrides } from '../keymap-load.helpers';

/** Builds a minimal injectable source stubbing only `getKeymap`, the sole method this helper reads. */
function buildSource(getKeymap: () => Promise<string>): Pick<PreferencesSource, 'getKeymap'> {
  return { getKeymap };
}

beforeEach(resetKeyboardStore);
afterEach(resetKeyboardStore);

describe('loadKeymapOverrides', () => {
  it("resolves an empty document ('') to no overrides, loaded", async () => {
    await loadKeymapOverrides(buildSource(() => Promise.resolve('')));

    expect(getKeyboardState().keymapLoadState).toBe('loaded');
    expect(getKeyboardState().overrides).toEqual({});
  });

  it('resolves a valid serialized document to its overrides', async () => {
    const document = JSON.stringify({ version: 1, bindings: { 'nav.today': 'ctrl+1' } });

    await loadKeymapOverrides(buildSource(() => Promise.resolve(document)));

    expect(getKeyboardState().keymapLoadState).toBe('loaded');
    expect(getKeyboardState().overrides).toEqual({ 'nav.today': 'ctrl+1' });
  });

  it('reports a garbage document as LOADED, not failed: it arrived fine and parseKeymap degraded its contents', async () => {
    await loadKeymapOverrides(buildSource(() => Promise.resolve('{not json: alt++')));

    expect(getKeyboardState().keymapLoadState).toBe('loaded');
    expect(getKeyboardState().overrides).toEqual({});
  });

  it('reports a REJECTED read as failed, which is what earns the panel its error state rather than an empty one', async () => {
    await loadKeymapOverrides(buildSource(() => Promise.reject(new Error('runtime unavailable'))));

    expect(getKeyboardState().keymapLoadState).toBe('failed');
    // Still published as no overrides rather than left pending: a failed read
    // must never strand the dispatcher, so the shortcuts keep working on
    // their declared chords while the panel reports the failure.
    expect(getKeyboardState().overrides).toEqual({});
  });
});
