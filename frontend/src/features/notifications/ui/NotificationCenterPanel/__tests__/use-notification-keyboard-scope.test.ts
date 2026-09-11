import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchKeyboardEvent } from '../../../../../shared/keyboard/dispatch.helpers';
import type { KeyboardDispatchEvent } from '../../../../../shared/keyboard/dispatch.helpers';
import { getKeyboardState, resetKeyboardStore } from '../../../../../shared/keyboard/keyboard-scope.helpers';
import { useNotificationKeyboardScope } from '../use-notification-keyboard-scope';

/** Builds a minimal literal satisfying `KeyboardDispatchEvent` for `alt+r`, mirroring `dispatch.helpers.test.ts`'s `baseEvent`. */
function buildAltREvent(): KeyboardDispatchEvent {
  return {
    key: 'r',
    code: 'KeyR',
    ctrlKey: false,
    altKey: true,
    shiftKey: false,
    metaKey: false,
    defaultPrevented: false,
    isComposing: false,
    target: null,
    preventDefault: () => undefined,
  };
}

beforeEach(resetKeyboardStore);
afterEach(resetKeyboardStore);

describe('useNotificationKeyboardScope', () => {
  it('runs onMarkAllRead when alt+r is dispatched while mounted and canMarkAllRead is true (S12)', () => {
    const onMarkAllRead = vi.fn();
    renderHook(() => useNotificationKeyboardScope({ canMarkAllRead: true, onMarkAllRead }));

    dispatchKeyboardEvent(buildAltREvent(), { navigate: vi.fn() });

    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it('runs nothing at the global scope once the panel unmounts and its frame is popped (S13)', () => {
    const onMarkAllRead = vi.fn();
    const { unmount } = renderHook(() => useNotificationKeyboardScope({ canMarkAllRead: true, onMarkAllRead }));

    unmount();
    dispatchKeyboardEvent(buildAltREvent(), { navigate: vi.fn() });

    expect(onMarkAllRead).not.toHaveBeenCalled();
  });

  it('swallows the chord without running onMarkAllRead when canMarkAllRead is false (D9)', () => {
    const onMarkAllRead = vi.fn();
    renderHook(() => useNotificationKeyboardScope({ canMarkAllRead: false, onMarkAllRead }));

    dispatchKeyboardEvent(buildAltREvent(), { navigate: vi.fn() });

    expect(onMarkAllRead).not.toHaveBeenCalled();
  });

  it('pushes exactly one command, shaped for the help dialog Slice 4 will read it through', () => {
    renderHook(() => useNotificationKeyboardScope({ canMarkAllRead: true, onMarkAllRead: vi.fn() }));

    const [frame] = getKeyboardState().frames;
    expect(frame?.scope).toBe('notification-center');
    const [command] = frame?.getCommands() ?? [];
    expect(command).toMatchObject({
      id: 'notification-center.mark-all-read',
      scope: 'notification-center',
      chord: 'alt+r',
      label: 'Mark all as read',
      section: 'Notifications',
    });
  });

  it('reacts to canMarkAllRead and onMarkAllRead updates across a re-render, rather than closing over the first render forever', () => {
    const firstOnMarkAllRead = vi.fn();
    const secondOnMarkAllRead = vi.fn();
    const { rerender } = renderHook(({ canMarkAllRead, onMarkAllRead }) => useNotificationKeyboardScope({ canMarkAllRead, onMarkAllRead }), {
      initialProps: { canMarkAllRead: false, onMarkAllRead: firstOnMarkAllRead },
    });

    rerender({ canMarkAllRead: true, onMarkAllRead: secondOnMarkAllRead });
    dispatchKeyboardEvent(buildAltREvent(), { navigate: vi.fn() });

    expect(firstOnMarkAllRead).not.toHaveBeenCalled();
    expect(secondOnMarkAllRead).toHaveBeenCalledTimes(1);
  });
});
