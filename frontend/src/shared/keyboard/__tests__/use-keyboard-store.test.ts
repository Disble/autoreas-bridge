import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetKeyboardStore, setKeyboardHelpOpen } from '../keyboard-scope.helpers';
import { useKeyboardStore } from '../use-keyboard-store';

beforeEach(resetKeyboardStore);
afterEach(resetKeyboardStore);

describe('useKeyboardStore', () => {
  it('returns the full store state when no selector is given', () => {
    const { result } = renderHook(() => useKeyboardStore());

    expect(result.current).toEqual({ frames: [], isHelpOpen: false, overrides: {}, keymapLoadState: 'pending' });
  });

  it('projects the state through a selector and re-renders once the store changes, proving it subscribes', () => {
    const { result } = renderHook(() => useKeyboardStore((state) => state.isHelpOpen));

    expect(result.current).toBe(false);

    act(() => {
      setKeyboardHelpOpen(true);
    });

    expect(result.current).toBe(true);
  });
});
