import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PreferencesSource } from '../../../infrastructure/preferences-source/preferences-source.types';
import { getKeyboardState, resetKeyboardStore } from '../keyboard-scope.helpers';
import { useKeymapOverrides } from '../use-keymap-overrides';

/** Builds a minimal injectable source stubbing only `getKeymap`, the sole method this hook reads. */
function buildSource(getKeymap: () => Promise<string>): Pick<PreferencesSource, 'getKeymap'> {
  return { getKeymap };
}

beforeEach(resetKeyboardStore);
afterEach(resetKeyboardStore);

describe('useKeymapOverrides', () => {
  it('starts pending with no overrides, so every command answers to its declared chord while the load is in flight', () => {
    expect(getKeyboardState().keymapLoadState).toBe('pending');
    expect(getKeyboardState().overrides).toEqual({});
  });

  it("resolves an empty document ('') to no overrides, loaded", async () => {
    renderHook(() => useKeymapOverrides(buildSource(() => Promise.resolve(''))));

    await waitFor(() => expect(getKeyboardState().keymapLoadState).toBe('loaded'));
    expect(getKeyboardState().overrides).toEqual({});
  });

  it('resolves a valid serialized document to its overrides', async () => {
    const document = JSON.stringify({ version: 1, bindings: { 'nav.today': 'ctrl+1' } });

    renderHook(() => useKeymapOverrides(buildSource(() => Promise.resolve(document))));

    await waitFor(() => expect(getKeyboardState().keymapLoadState).toBe('loaded'));
    expect(getKeyboardState().overrides).toEqual({ 'nav.today': 'ctrl+1' });
  });

  it("reports a garbage document as LOADED, not failed: it arrived fine and parseKeymap degraded its contents", async () => {
    renderHook(() => useKeymapOverrides(buildSource(() => Promise.resolve('{not json: alt++'))));

    await waitFor(() => expect(getKeyboardState().keymapLoadState).toBe('loaded'));
    expect(getKeyboardState().overrides).toEqual({});
  });

  it('reports a REJECTED read as failed, which is what earns the panel its error state rather than an empty one', async () => {
    renderHook(() => useKeymapOverrides(buildSource(() => Promise.reject(new Error('runtime unavailable')))));

    await waitFor(() => expect(getKeyboardState().keymapLoadState).toBe('failed'));
    // Still published as no overrides rather than left pending: a failed read
    // must never strand the dispatcher, so the shortcuts keep working on
    // their declared chords while the panel reports the failure.
    expect(getKeyboardState().overrides).toEqual({});
  });

  it('re-runs the load when the injected source changes across a re-render, rather than closing over the first render forever', async () => {
    const firstSource = buildSource(() => Promise.resolve(''));
    const secondDocument = JSON.stringify({ version: 1, bindings: { 'nav.today': 'ctrl+2' } });
    const secondSource = buildSource(() => Promise.resolve(secondDocument));

    const { rerender } = renderHook(({ source }) => useKeymapOverrides(source), { initialProps: { source: firstSource } });
    await waitFor(() => expect(getKeyboardState().keymapLoadState).toBe('loaded'));

    rerender({ source: secondSource });

    await waitFor(() => expect(getKeyboardState().overrides).toEqual({ 'nav.today': 'ctrl+2' }));
  });
});
