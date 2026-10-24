import type { ActivityFeedLine } from '../feed-source/feed.types';
import type { DrawerPresence, DrawerTransitionEnd } from './drawer.types';

/**
 * The drawer's presence after the screen's open line changed: opening starts a
 * new session, closing holds the last line so the panel can slide out, and a
 * line change while open keeps the session (the technical view survives ↑ / ↓).
 *
 * @param held The current presence.
 * @param line The screen's open line; undefined when closed.
 * @returns The next presence, or `held` itself when nothing changed.
 */
export function nextDrawerPresence(held: DrawerPresence, line: ActivityFeedLine | undefined): DrawerPresence {
  if (line === undefined) {
    return held.open ? { ...held, open: false } : held;
  }
  if (!held.open) {
    return { line, open: true, session: held.session + 1 };
  }
  return held.line === line ? held : { ...held, line };
}

/**
 * Drops the held line once a closed drawer has slid out, which unmounts it.
 *
 * @param held The current presence.
 * @returns The settled presence, or `held` itself while open.
 */
export function settleDrawerPresence(held: DrawerPresence): DrawerPresence {
  return held.open ? held : { ...held, line: undefined };
}

/**
 * Whether a `transitionend` is the panel's own slide, not its width change or a child's transition.
 *
 * @param event The transition end.
 * @returns True for the panel's `translate`.
 */
export function isDrawerSlideOutEnd(event: DrawerTransitionEnd): boolean {
  return event.propertyName === 'translate' && event.target === event.currentTarget;
}
