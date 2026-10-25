import { useCallback, useState } from 'react';
import type { ActivityFeedLine } from '../feed-source/feed.types';
import { DRAWER_PRESENCE_CLOSED } from './drawer.constants';
import { isDrawerSlideOutEnd, nextDrawerPresence, settleDrawerPresence } from './drawer-presence.helpers';
import type { DrawerPresence, DrawerTransitionEnd } from './drawer.types';

/**
 * Keeps the drawer mounted while it slides out (activity-ui-design-v2.md S12
 * M2): after the screen closes it, the last line stays held until the panel's
 * `translate` transition ends. Each opening is a new session, so a reopened
 * drawer starts at its summary.
 *
 * @param line The screen's open line; undefined when closed.
 * @returns The held line, whether it is open, its session and the panel's transition end handler.
 */
export function useDrawerPresence(line: ActivityFeedLine | undefined) {
  // 1. Refs

  // 2. State
  const [held, setHeld] = useState<DrawerPresence>(DRAWER_PRESENCE_CLOSED);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const next = nextDrawerPresence(held, line);
  if (next !== held) {
    setHeld(next);
  }

  // 6. Callbacks (useCallback calling pure helpers)
  const onTransitionEnd = useCallback((event: DrawerTransitionEnd) => {
    if (isDrawerSlideOutEnd(event)) {
      setHeld(settleDrawerPresence);
    }
  }, []);

  // 7. Effects

  return { line: next.line, open: next.open, session: next.session, onTransitionEnd };
}
