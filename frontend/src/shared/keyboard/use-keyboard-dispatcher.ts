import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { dispatchKeyboardEvent } from './dispatch.helpers';
import type { KeyboardDispatchEvent } from './dispatch.helpers';

/**
 * Mounts the single global `keydown` listener that drives every keyboard
 * command (spec "Exactly One Global Dispatcher Bails On Four Guard
 * Conditions"). Bound on `window` in a mount-only effect -- empty dependency
 * array, design §4 -- and removed on cleanup with the exact same function
 * reference it was added with, so React never leaks a second listener across
 * a re-render or `<React.StrictMode>`'s double-invocation (R-5).
 *
 * Binding on the bubble phase, never capture, is what makes a widget's own
 * `event.defaultPrevented` observable here (D5): React 18+ attaches its
 * listeners at the root container, which sits below `window` in the native
 * bubble path, so a focused HeroUI/React Aria widget that already claimed
 * the key runs first.
 */
export function useKeyboardDispatcher(): void {
  // 3. Context/3rd party hooks
  const navigate = useNavigate();

  // 1. Refs (declared after the hook whose value seeds them, mirroring
  // use-notification-navigation.ts's navigateRef -- there is no null
  // initial state and therefore no unreachable null branch to defend)
  const navigateRef = useRef(navigate);

  // 7. Effects
  // Refreshed every render, exactly like navigateRef.current above, so the
  // mount-only effect below never reads a stale navigate function while
  // still only ever binding the listener once.
  //
  // BOUNDARY: no test pins this refresh, mirroring use-notification-
  // navigation.ts's own documented boundary for the identical pattern.
  // Every command's `run` calls `navigate(to)` with a compile-time absolute
  // route (`APP_LAYOUT_NAV_GROUPS`), so a stale `navigate` is currently
  // indistinguishable from a fresh one. Kept because that is a property of
  // today's commands rather than of this hook.
  useEffect(() => {
    navigateRef.current = navigate;
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      // A real `KeyboardEvent.target` types as the near-empty `EventTarget`,
      // which shares no declared property with `TypingTargetLike` even
      // though every one of that type's fields is optional -- so TS flags
      // the direct assignment as a likely mistake (its "weak type" check).
      // The real element still satisfies `TypingTargetLike` structurally at
      // runtime (`isTypingTarget` reads exactly `tagName`/`isContentEditable`
      // /`getAttribute`, all of which a DOM `Element` has), so the cast is
      // sound, not a type-safety hole.
      dispatchKeyboardEvent(event as unknown as KeyboardDispatchEvent, { navigate: navigateRef.current });
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // EQUIVALENT MUTANT: mutation testing swaps this `[]` for a constant
    // truthy array (e.g. `["Stryker was here"]`). Both are equivalent at
    // runtime -- React compares dependency arrays element-by-element, and a
    // FIXED literal's content never differs across renders any more than an
    // empty array's does, so the effect still only ever runs once under
    // either one. No test can observe the difference; a `// Stryker disable`
    // comment does not suppress it here (unlike the precedents in
    // dispatch.helpers.ts and history-table.helpers.ts) because this array is
    // a trailing call argument, not a leading statement, and Stryker's
    // comment scanner does not associate with it.
  }, []);
}
