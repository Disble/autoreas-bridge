import { keyboardStore } from './keyboard.constants';
import type { KeyboardScopeFrame, KeyboardStoreState } from './keyboard.types';
import type { KeymapOverrides } from './keymap.types';

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
 * Publishes resolved keymap overrides into the store and records the load as
 * `'loaded'` (design D1). Every caller -- the initial read, a successful
 * save, a per-binding revert, a whole-keymap reset -- represents overrides
 * now being authoritative.
 *
 * A document that parsed to no overrides comes through here too, with `{}`:
 * it loaded, and its contents were simply empty or unreadable. Only a
 * rejected read goes to `failKeymapLoad`, because the panel owes an error
 * state for that case and cannot tell the two apart from `overrides` alone.
 */
export function setKeymapOverrides(overrides: KeymapOverrides): void {
  keyboardStore.setState({ overrides, keymapLoadState: 'loaded' });
}

/**
 * Records that the keymap could not be read at all, which is what earns the
 * panel's error state (spec: a failed load shows the error state, never a
 * loading placeholder or an empty one).
 *
 * `overrides` is still published as `{}` rather than left pending, because a
 * failed read must never strand the dispatcher: every command keeps
 * answering to its declared chord, so the shortcuts stay usable while the
 * panel reports the failure.
 */
export function failKeymapLoad(): void {
  keyboardStore.setState({ overrides: {}, keymapLoadState: 'failed' });
}

/**
 * Restores the keyboard store to its initial shape. Test-only: every later
 * suite touching `keyboardStore` imports this to avoid leaking frames,
 * `isHelpOpen` and the keymap fields across tests.
 */
export function resetKeyboardStore(): void {
  keyboardStore.setState({ frames: [], isHelpOpen: false, overrides: {}, keymapLoadState: 'pending' });
}
