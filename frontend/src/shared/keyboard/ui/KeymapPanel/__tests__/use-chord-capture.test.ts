import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useChordCapture } from '../use-chord-capture';

/**
 * Builds a minimal object satisfying every field `useChordCapture`'s
 * `onKeyDown` reads -- `normalizeChord`'s structural subset of the DOM
 * `KeyboardEvent` (`key`/`code`/the four modifier flags), plus
 * `preventDefault` and `nativeEvent.isComposing` -- cast to React's full
 * `KeyboardEvent` type rather than hand-satisfying its many unrelated
 * members. Mirrors `dispatch.helpers.test.ts`'s narrower `KeyboardDispatchEvent`
 * literal, adapted for the wider prop type `keymap-panel.types.ts` already
 * declares for `UseChordCaptureResult.onKeyDown`.
 */
function buildKeyEvent(
  overrides: Readonly<{
    key?: string;
    code?: string;
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
    metaKey?: boolean;
    isComposing?: boolean;
    preventDefault?: () => void;
  }> = {},
): ReactKeyboardEvent {
  return {
    key: overrides.key ?? '1',
    code: overrides.code ?? 'Digit1',
    ctrlKey: overrides.ctrlKey ?? false,
    altKey: overrides.altKey ?? false,
    shiftKey: overrides.shiftKey ?? false,
    metaKey: overrides.metaKey ?? false,
    preventDefault: overrides.preventDefault ?? ((): void => {}),
    nativeEvent: { isComposing: overrides.isComposing ?? false },
  } as unknown as ReactKeyboardEvent;
}

describe('useChordCapture', () => {
  it('starts disarmed with no candidate chord', () => {
    const { result } = renderHook(() => useChordCapture());

    expect(result.current.isArmed).toBe(false);
    expect(result.current.candidateChord).toBeNull();
  });

  it('records the next pressed chord once armed, and stays armed afterward', () => {
    const { result } = renderHook(() => useChordCapture());

    act(() => result.current.arm());
    act(() => result.current.onKeyDown(buildKeyEvent({ key: '1', code: 'Digit1', ctrlKey: true })));

    expect(result.current.candidateChord).toBe('ctrl+1');
    expect(result.current.isArmed).toBe(true);
  });

  it('calls preventDefault on every keydown while armed, including one that will not end up recorded', () => {
    const { result } = renderHook(() => useChordCapture());
    const preventDefault = vi.fn();

    act(() => result.current.arm());
    act(() => result.current.onKeyDown(buildKeyEvent({ key: 'Shift', code: 'ShiftLeft', shiftKey: true, preventDefault })));

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.candidateChord).toBeNull();
    expect(result.current.isArmed).toBe(true);
  });

  it('is a no-op, and never calls preventDefault, for a keydown that arrives before the control is armed', () => {
    const { result } = renderHook(() => useChordCapture());
    const preventDefault = vi.fn();

    act(() => result.current.onKeyDown(buildKeyEvent({ ctrlKey: true, preventDefault })));

    expect(preventDefault).not.toHaveBeenCalled();
    expect(result.current.candidateChord).toBeNull();
    expect(result.current.isArmed).toBe(false);
  });

  it('cancels on Escape -- checked before normalization -- recording nothing and disarming', () => {
    const { result } = renderHook(() => useChordCapture());

    act(() => result.current.arm());
    act(() => result.current.onKeyDown(buildKeyEvent({ key: 'Escape', code: 'Escape' })));

    expect(result.current.isArmed).toBe(false);
    expect(result.current.candidateChord).toBeNull();
  });

  it('a bare modifier press keeps the control armed and records nothing', () => {
    const { result } = renderHook(() => useChordCapture());

    act(() => result.current.arm());
    act(() => result.current.onKeyDown(buildKeyEvent({ key: 'Control', code: 'ControlLeft', ctrlKey: true })));

    expect(result.current.isArmed).toBe(true);
    expect(result.current.candidateChord).toBeNull();
  });

  it('a bare modifier press leaves an already-recorded candidate untouched, rather than overwriting it with null', () => {
    const { result } = renderHook(() => useChordCapture());

    act(() => result.current.arm());
    act(() => result.current.onKeyDown(buildKeyEvent({ ctrlKey: true })));
    expect(result.current.candidateChord).toBe('ctrl+1');

    act(() => result.current.onKeyDown(buildKeyEvent({ key: 'Shift', code: 'ShiftLeft', shiftKey: true })));

    expect(result.current.candidateChord).toBe('ctrl+1');
    expect(result.current.isArmed).toBe(true);
  });

  it('disarms on blur', () => {
    const { result } = renderHook(() => useChordCapture());

    act(() => result.current.arm());
    act(() => result.current.onBlur());

    expect(result.current.isArmed).toBe(false);
  });

  it('ignores an IME composition keydown -- preventDefault still runs, but nothing is recorded and arming holds', () => {
    const { result } = renderHook(() => useChordCapture());
    const preventDefault = vi.fn();

    act(() => result.current.arm());
    act(() => result.current.onKeyDown(buildKeyEvent({ key: 'a', code: 'KeyA', isComposing: true, preventDefault })));

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.candidateChord).toBeNull();
    expect(result.current.isArmed).toBe(true);
  });

  it('a keydown after blur disarmed the control is a no-op, proving onKeyDown does not close over a stale isArmed', () => {
    const { result } = renderHook(() => useChordCapture());
    const preventDefault = vi.fn();

    act(() => result.current.arm());
    act(() => result.current.onBlur());
    act(() => result.current.onKeyDown(buildKeyEvent({ ctrlKey: true, preventDefault })));

    expect(preventDefault).not.toHaveBeenCalled();
    expect(result.current.candidateChord).toBeNull();
  });

  it('re-arming clears a previously recorded candidate chord', () => {
    const { result } = renderHook(() => useChordCapture());

    act(() => result.current.arm());
    act(() => result.current.onKeyDown(buildKeyEvent({ ctrlKey: true })));
    expect(result.current.candidateChord).toBe('ctrl+1');

    act(() => result.current.arm());

    expect(result.current.candidateChord).toBeNull();
    expect(result.current.isArmed).toBe(true);
  });
});
