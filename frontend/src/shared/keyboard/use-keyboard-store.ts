import { useStore } from 'zustand';
import { keyboardStore } from './keyboard.constants';
import type { KeyboardStoreState } from './keyboard.types';

/**
 * Reads and subscribes to the keyboard store, optionally through a selector.
 * Mirrors `use-notification-store.ts` verbatim (D4): both wrap a vanilla
 * `createStore()` instance with zustand's `useStore` so a React consumer can
 * re-render on change while `dispatch.helpers.ts` still reads the same store
 * outside React via `.getState()`.
 */
export function useKeyboardStore<T = KeyboardStoreState>(
  selector: (state: KeyboardStoreState) => T = ((state: KeyboardStoreState) => state as T),
): T {
  return useStore(keyboardStore, selector);
}
