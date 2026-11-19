import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
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
  it('captures one session: ignores keys until armed, skips modifiers and IME, records, re-arms, cancels', () => {
    const { result } = renderHook(() => useChordCapture());
    const preventDefault = vi.fn();

    expect(result.current.isArmed).toBe(false);
    expect(result.current.candidateChord).toBeNull();

    act(() => result.current.onKeyDown(buildKeyEvent({ ctrlKey: true, preventDefault })));

    expect(preventDefault).not.toHaveBeenCalled();
    expect(result.current.candidateChord).toBeNull();
    expect(result.current.isArmed).toBe(false);

    act(() => result.current.arm());
    act(() => result.current.onKeyDown(buildKeyEvent({ key: 'Shift', code: 'ShiftLeft', shiftKey: true, preventDefault })));

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.candidateChord).toBeNull();
    expect(result.current.isArmed).toBe(true);

    act(() => result.current.onKeyDown(buildKeyEvent({ key: 'Control', code: 'ControlLeft', ctrlKey: true })));

    expect(result.current.isArmed).toBe(true);
    expect(result.current.candidateChord).toBeNull();

    act(() => result.current.onKeyDown(buildKeyEvent({ key: 'a', code: 'KeyA', isComposing: true, preventDefault })));

    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(result.current.candidateChord).toBeNull();
    expect(result.current.isArmed).toBe(true);

    act(() => result.current.onKeyDown(buildKeyEvent({ key: '1', code: 'Digit1', ctrlKey: true })));

    expect(result.current.candidateChord).toBe('ctrl+1');
    expect(result.current.isArmed).toBe(true);

    act(() => result.current.onKeyDown(buildKeyEvent({ key: 'Shift', code: 'ShiftLeft', shiftKey: true })));

    expect(result.current.candidateChord).toBe('ctrl+1');
    expect(result.current.isArmed).toBe(true);

    act(() => result.current.arm());

    expect(result.current.candidateChord).toBeNull();
    expect(result.current.isArmed).toBe(true);

    act(() => result.current.onKeyDown(buildKeyEvent({ key: 'Escape', code: 'Escape' })));

    expect(result.current.isArmed).toBe(false);
    expect(result.current.candidateChord).toBeNull();
  });

  it('disarms on blur, and a later keydown is a no-op rather than closing over a stale isArmed', () => {
    const { result } = renderHook(() => useChordCapture());
    const preventDefault = vi.fn();

    act(() => result.current.arm());
    act(() => result.current.onBlur());

    expect(result.current.isArmed).toBe(false);

    act(() => result.current.onKeyDown(buildKeyEvent({ ctrlKey: true, preventDefault })));

    expect(preventDefault).not.toHaveBeenCalled();
    expect(result.current.candidateChord).toBeNull();
  });

  describe('onCaptured (Slice 62j: capture disarms once a captured chord is actually persisted)', () => {
    it('disarms only once the returned promise resolves true, never immediately (an async persist attempt)', async () => {
      const onCaptured = vi.fn().mockResolvedValue(true);
      const { result } = renderHook(() => useChordCapture(onCaptured));

      act(() => result.current.arm());
      act(() => result.current.onKeyDown(buildKeyEvent({ ctrlKey: true })));

      expect(result.current.isArmed).toBe(true);
      await waitFor(() => expect(result.current.isArmed).toBe(false));
    });

    it('skips onCaptured for a bare modifier, then stays armed once a recorded chord resolves false', async () => {
      const onCaptured = vi.fn().mockResolvedValue(false);
      const { result } = renderHook(() => useChordCapture(onCaptured));

      act(() => result.current.arm());
      act(() => result.current.onKeyDown(buildKeyEvent({ key: 'Control', code: 'ControlLeft', ctrlKey: true })));

      expect(onCaptured).not.toHaveBeenCalled();

      act(() => result.current.onKeyDown(buildKeyEvent({ ctrlKey: true })));

      await waitFor(() => expect(onCaptured).toHaveBeenCalledTimes(1));
      expect(result.current.isArmed).toBe(true);
    });
  });
});
