import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SettingsSource } from '../../contracts/settings.types';
import { getKeyboardState, resetKeyboardStore } from '../keyboard-scope.helpers';
import { useKeymapOverrides } from '../use-keymap-overrides';

/** Builds a minimal injectable source stubbing only `getKeymap`, the sole method this hook reads. */
function buildSource(getKeymap: () => Promise<string>): Pick<SettingsSource, 'getKeymap'> {
  return { getKeymap };
}

/** A settings module that is already ready. */
const settingsReady = () => Promise.resolve();

beforeEach(resetKeyboardStore);
afterEach(resetKeyboardStore);

/**
 * This suite owns the hook's WIRING only: that it fires the load on mount,
 * and that it fires again when the injected source changes. Every
 * document-outcome case -- empty, valid, garbage, rejected -- belongs to
 * `keymap-load.helpers.test.ts` and is asserted there, because since the
 * extraction this hook is a one-line delegation with no per-outcome branch
 * of its own. Repeating the outcomes here killed no additional mutant: the
 * hook's only two possible internal defects are "never calls the loader",
 * which any single outcome case catches, and "wrong effect deps", which
 * only the re-render case catches. Do not re-add the outcome cases here.
 */
describe('useKeymapOverrides', () => {
  it('starts pending with no overrides, resolves a valid document, and re-runs the load for a new source', async () => {
    // Every command answers to its declared chord while the load is in flight.
    expect(getKeyboardState().keymapLoadState).toBe('pending');
    expect(getKeyboardState().overrides).toEqual({});

    const firstDocument = JSON.stringify({ version: 1, bindings: { 'nav.today': 'ctrl+1' } });
    const firstSource = buildSource(() => Promise.resolve(firstDocument));
    const secondDocument = JSON.stringify({ version: 1, bindings: { 'nav.today': 'ctrl+2' } });
    const secondSource = buildSource(() => Promise.resolve(secondDocument));

    const { rerender } = renderHook(({ source }) => useKeymapOverrides(source, settingsReady), { initialProps: { source: firstSource } });

    await waitFor(() => expect(getKeyboardState().keymapLoadState).toBe('loaded'));
    expect(getKeyboardState().overrides).toEqual({ 'nav.today': 'ctrl+1' });

    rerender({ source: secondSource });

    await waitFor(() => expect(getKeyboardState().overrides).toEqual({ 'nav.today': 'ctrl+2' }));
  });
});
