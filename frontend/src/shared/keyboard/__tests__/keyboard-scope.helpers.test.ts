import { beforeEach, describe, expect, it } from 'vitest';
import {
  getKeyboardState,
  popKeyboardScopeFrame,
  pushKeyboardScopeFrame,
  resetKeyboardStore,
  setKeyboardHelpOpen,
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

describe('resetKeyboardStore', () => {
  it('returns the store to its initial shape after frames and isHelpOpen change', () => {
    pushKeyboardScopeFrame(buildFrame(1));
    setKeyboardHelpOpen(true);

    resetKeyboardStore();

    expect(getKeyboardState()).toEqual({ frames: [], isHelpOpen: false });
  });
});
