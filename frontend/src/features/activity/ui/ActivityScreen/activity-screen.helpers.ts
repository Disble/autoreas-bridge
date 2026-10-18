import type { Key } from '@heroui/react';
import { ACTIVITY_TAB_IDS } from './activity-screen.constants';
import type { ActivityTabId } from './activity-screen.types';

/**
 * Narrows a tab-strip selection key onto a tab id; anything else opens Now.
 *
 * @param key The key the tab strip reported.
 * @returns The tab to show.
 */
export function toActivityTabId(key: Key): ActivityTabId {
  return ACTIVITY_TAB_IDS.find((id) => id === key) ?? 'now';
}
