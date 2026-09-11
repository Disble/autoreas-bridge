import { beforeEach, describe, expect, it } from 'vitest';
import {
  failKeymapLoad,
  getKeyboardState,
  popKeyboardScopeFrame,
  pushKeyboardScopeFrame,
  resetKeyboardStore,
  setKeyboardHelpOpen,
  setKeymapOverrides,
} from '../keyboard-scope.helpers';
import type { KeyboardScopeFrame } from '../keyboard.types';

/** Builds a minimal scope frame for a given id; `getCommands` is never read by these tests. */
function buildFrame(id: number, scope: KeyboardScopeFrame['scope'] = 'global'): KeyboardScopeFrame {
  return { id, scope, getCommands: () => [] };
}

beforeEach(() => {
  resetKeyboardStore();
});

describe('pushKeyboardScopeFrame / popKeyboardScopeFrame', () => {
  it('makes a pushed frame the innermost, restoring the prior top-of-stack once popped', () => {
    const globalFrame = buildFrame(1, 'global');
    const routeFrame = buildFrame(2, 'notification-center');

    pushKeyboardScopeFrame(globalFrame);
    pushKeyboardScopeFrame(routeFrame);
    expect(getKeyboardState().frames).toEqual([globalFrame, routeFrame]);

    popKeyboardScopeFrame(routeFrame.id);
    expect(getKeyboardState().frames).toEqual([globalFrame]);
  });

  it('removes only the frame matching an out-of-order pop, leaving the others untouched', () => {
    const frameA = buildFrame(1);
    const frameB = buildFrame(2);
    const frameC = buildFrame(3);

    pushKeyboardScopeFrame(frameA);
    pushKeyboardScopeFrame(frameB);
    pushKeyboardScopeFrame(frameC);

    popKeyboardScopeFrame(frameB.id);

    expect(getKeyboardState().frames).toEqual([frameA, frameC]);
  });

  it('treats a double pop of the same id as a no-op', () => {
    const frame = buildFrame(1);
    pushKeyboardScopeFrame(frame);

    popKeyboardScopeFrame(frame.id);
    popKeyboardScopeFrame(frame.id);

    expect(getKeyboardState().frames).toEqual([]);
  });
});

describe('setKeyboardHelpOpen', () => {
  it('flips isHelpOpen to the value it is given', () => {
    setKeyboardHelpOpen(true);
    expect(getKeyboardState().isHelpOpen).toBe(true);

    setKeyboardHelpOpen(false);
    expect(getKeyboardState().isHelpOpen).toBe(false);
  });
});

describe('setKeymapOverrides', () => {
  it('publishes the given overrides into the store and records the load as loaded (D1, D11)', () => {
    expect(getKeyboardState().keymapLoadState).toBe('pending');

    setKeymapOverrides({ 'nav.today': 'ctrl+1' });

    expect(getKeyboardState().overrides).toEqual({ 'nav.today': 'ctrl+1' });
    expect(getKeyboardState().keymapLoadState).toBe('loaded');
  });

  it('records an empty document as loaded, not failed, so a user who rebound nothing is not reported as a broken runtime', () => {
    setKeymapOverrides({});

    expect(getKeyboardState().keymapLoadState).toBe('loaded');
    expect(getKeyboardState().overrides).toEqual({});
  });
});

describe('failKeymapLoad', () => {
  it('records the failure while still publishing no overrides, so the dispatcher keeps working on declared chords', () => {
    setKeymapOverrides({ 'nav.today': 'ctrl+1' });

    failKeymapLoad();

    expect(getKeyboardState().keymapLoadState).toBe('failed');
    expect(getKeyboardState().overrides).toEqual({});
  });

  it('is distinguishable from a loaded empty keymap, which is the whole reason the state is not a boolean', () => {
    setKeymapOverrides({});
    const loadedEmpty = getKeyboardState().keymapLoadState;

    failKeymapLoad();

    expect(loadedEmpty).toBe('loaded');
    expect(getKeyboardState().keymapLoadState).toBe('failed');
  });
});

describe('resetKeyboardStore', () => {
  it('returns the store to its initial shape after frames, isHelpOpen and the keymap fields change', () => {
    pushKeyboardScopeFrame(buildFrame(1));
    setKeyboardHelpOpen(true);
    setKeymapOverrides({ 'nav.today': 'ctrl+1' });

    resetKeyboardStore();

    expect(getKeyboardState()).toEqual({ frames: [], isHelpOpen: false, overrides: {}, keymapLoadState: 'pending' });
  });
});
