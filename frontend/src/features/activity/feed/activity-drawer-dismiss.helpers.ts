import { ACTIVITY_DRAWER_KEEP_OPEN_SELECTOR } from './activity-feed.constants';

/**
 * Whether a pointer press closes the drawer: anywhere outside both the
 * drawer and the feed rows (a row press opens that row instead).
 *
 * @param target The pressed element.
 * @returns True when the press closes the drawer.
 */
export function isDrawerDismissTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(ACTIVITY_DRAWER_KEEP_OPEN_SELECTOR) === null;
}

/**
 * Moves focus back to a feed row, after the drawer it opened closed.
 *
 * @param root The document to search.
 * @param key The row's `kind:id` key; undefined focuses nothing.
 */
export function focusFeedRow(root: Document, key: string | undefined): void {
  const row = [...root.querySelectorAll<HTMLElement>('[data-feed-row]')].find((element) => element.dataset.feedRow === key);
  row?.focus();
}
