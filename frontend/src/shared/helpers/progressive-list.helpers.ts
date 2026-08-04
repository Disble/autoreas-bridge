/**
 * Reports whether a scroll container sits within `threshold` pixels of its own
 * bottom, which is the trigger for appending the next batch of rows. A list
 * shorter than its viewport reports true: it is already fully scrolled.
 */
export function isNearListBottom(scrollTop: number, clientHeight: number, scrollHeight: number, threshold = 240): boolean {
  return scrollHeight - (scrollTop + clientHeight) <= threshold;
}

/**
 * Clamps the next progressive render limit: never below the batch already shown,
 * never above the total item count. Keeps the growing-scrollbar contract honest.
 */
export function nextRenderLimit(current: number, batch: number, itemCount: number): number {
  return Math.min(itemCount, current + batch);
}
