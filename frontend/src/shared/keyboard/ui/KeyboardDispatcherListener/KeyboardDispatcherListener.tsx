import { useKeyboardDispatcher } from '../../use-keyboard-dispatcher';
import { useKeymapOverrides } from '../../use-keymap-overrides';

/**
 * Renders nothing and exists only to hold the shared keyboard runtime's two
 * concerns inside router context (D11 -- concrete-path import, no `app/`
 * re-export seam), the same shape `NotificationNavigationListener` uses for
 * its own runtime listener: `useKeyboardDispatcher` for the one global
 * `keydown` listener, and `useKeymapOverrides` for loading the persisted
 * keymap once so the dispatcher and every display surface resolve overrides
 * from the moment the app shell mounts.
 */
export function KeyboardDispatcherListener() {
  useKeyboardDispatcher();
  useKeymapOverrides();

  return null;
}
