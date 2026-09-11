import { keyboardStore } from './keyboard.constants';
import type { KeyboardScopeFrame, KeyboardStoreState } from './keyboard.types';

/** Reads the current keyboard store snapshot outside React render, for the dispatcher's `window` listener (D4). */
export function getKeyboardState(): KeyboardStoreState {
  return keyboardStore.getState();
}

/**
 * Pushes a scope frame onto the stack, making it innermost. A frame is
 * pushed exactly once by its owning `useKeyboardScope` mount (design §3);
 * this helper only appends, it never deduplicates by scope or id.
 */
export function pushKeyboardScopeFrame(frame: KeyboardScopeFrame): void {
  keyboardStore.setState((state) => ({ frames: [...state.frames, frame] }));
}

/**
 * Removes a frame by `id`, restoring whichever frame is now last. Filtering
 * by id rather than popping the tail is deliberate (D10): under
 * `<React.StrictMode>` double-invocation, popping the tail can remove a
 * frame that belongs to someone else. Popping an `id` no longer on the stack
 * is a no-op, so an effect cleanup running twice is harmless.
 */
export function popKeyboardScopeFrame(id: number): void {
  keyboardStore.setState((state) => ({ frames: state.frames.filter((frame) => frame.id !== id) }));
}

/** Flips whether the shortcuts help overlay is showing. */
export function setKeyboardHelpOpen(isHelpOpen: boolean): void {
  keyboardStore.setState({ isHelpOpen });
}

/**
 * Restores the keyboard store to its initial shape. Test-only: every later
 * suite touching `keyboardStore` imports this to avoid leaking frames and
 * `isHelpOpen` across tests.
 */
export function resetKeyboardStore(): void {
  keyboardStore.setState({ frames: [], isHelpOpen: false });
}
