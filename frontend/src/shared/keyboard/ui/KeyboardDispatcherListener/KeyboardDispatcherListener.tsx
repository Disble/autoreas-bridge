import { useKeyboardDispatcher } from '../../use-keyboard-dispatcher';

/**
 * Renders nothing and exists only to hold `useKeyboardDispatcher` inside
 * router context (D11 -- concrete-path import, no `app/` re-export seam),
 * the same shape `NotificationNavigationListener` uses for its own runtime
 * listener.
 */
export function KeyboardDispatcherListener() {
  useKeyboardDispatcher();

  return null;
}
