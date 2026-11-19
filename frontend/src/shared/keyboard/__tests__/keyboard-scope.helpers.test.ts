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
  it('stacks pushed frames innermost-last, pops by id even out of order, and ignores a double pop', () => {
    const globalFrame = buildFrame(1, 'global');
    const routeFrame = buildFrame(2, 'notification-center');
    const frameB = buildFrame(3);
    const frameC = buildFrame(4);

    pushKeyboardScopeFrame(globalFrame);
    pushKeyboardScopeFrame(routeFrame);
    expect(getKeyboardState().frames).toEqual([globalFrame, routeFrame]);

    popKeyboardScopeFrame(routeFrame.id);
    expect(getKeyboardState().frames).toEqual([globalFrame]);

    pushKeyboardScopeFrame(frameB);
    pushKeyboardScopeFrame(frameC);
    popKeyboardScopeFrame(frameB.id);

    expect(getKeyboardState().frames).toEqual([globalFrame, frameC]);

    popKeyboardScopeFrame(frameB.id);

    expect(getKeyboardState().frames).toEqual([globalFrame, frameC]);
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

describe('setKeymapOverrides / failKeymapLoad', () => {
  it('records empty and real documents as loaded, then a failure as failed with no overrides (D1, D11)', () => {
    expect(getKeyboardState().keymapLoadState).toBe('pending');

    // A user who rebound nothing is loaded, never reported as a broken runtime.
    setKeymapOverrides({});

    expect(getKeyboardState().keymapLoadState).toBe('loaded');
    expect(getKeyboardState().overrides).toEqual({});

    setKeymapOverrides({ 'nav.today': 'ctrl+1' });

    expect(getKeyboardState().overrides).toEqual({ 'nav.today': 'ctrl+1' });
    expect(getKeyboardState().keymapLoadState).toBe('loaded');

    // Distinguishable from a loaded empty keymap, and still publishing no
    // overrides so the dispatcher keeps working on declared chords.
    failKeymapLoad();

    expect(getKeyboardState().keymapLoadState).toBe('failed');
    expect(getKeyboardState().overrides).toEqual({});
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
