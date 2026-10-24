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

/**
 * Whether a pointer press lands outside an element, which closes the failure menu.
 *
 * @param target The pressed element.
 * @param element The element that keeps the menu open; null treats every press as inside.
 * @returns True when the press is outside the element.
 */
export function isOutsideElement(target: EventTarget | null, element: Element | null): boolean {
  return element !== null && target instanceof Node && !element.contains(target);
}

/**
 * Moves focus back to the failure pill, after Esc closed its menu.
 *
 * @param group The pill and its menu; null focuses nothing.
 */
export function focusFailurePill(group: Element | null): void {
  group?.querySelector<HTMLElement>('[data-failure-pill]')?.focus();
}
