import type { ActivityChartScale, ActivityChartSlot } from '../feed-source/feed.types';
import {
  ACTIVITY_FEED_COUNT_FORMAT,
  ACTIVITY_FEED_DAY_FORMAT,
  ACTIVITY_FEED_MOMENT_FORMAT,
  ACTIVITY_FEED_MONTH_FORMAT,
  ACTIVITY_FEED_SHORT_DATE_FORMAT,
  ACTIVITY_FEED_TIME_FORMAT,
  ACTIVITY_MIN_BAR_PERCENT,
} from './activity-feed.constants';
import type { ActivityChartBarModel, ActivityChartBarState, ActivityRange } from './activity-feed.types';

/** Whether a slot overlaps a range. */
function overlaps(slot: ActivityChartSlot, range: ActivityRange): boolean {
  return slot.startMs <= range.toMs && range.fromMs < slot.endMs;
}

/** `100 lines · 3 failed`. */
function formatCounts(slot: ActivityChartSlot): string {
  const lines = `${ACTIVITY_FEED_COUNT_FORMAT.format(slot.count)} ${slot.count === 1 ? 'line' : 'lines'}`;
  return slot.failed > 0 ? `${lines} · ${ACTIVITY_FEED_COUNT_FORMAT.format(slot.failed)} failed` : lines;
}

/** The slot's span: `Oct 22, 12:00 – 13:00` hourly, `Wed, Oct 21` daily. */
function formatSpan(slot: ActivityChartSlot, scale: ActivityChartScale): string {
  if (scale === '24h') {
    return `${ACTIVITY_FEED_MOMENT_FORMAT.format(slot.startMs)} – ${ACTIVITY_FEED_TIME_FORMAT.format(slot.endMs)}`;
  }
  return ACTIVITY_FEED_DAY_FORMAT.format(slot.startMs);
}

/** The axis tick under a bar; the newest bar reads Now or Today. */
function formatTick(slot: ActivityChartSlot, scale: ActivityChartScale, index: number, count: number): string {
  const fromEnd = count - 1 - index;
  const start = new Date(slot.startMs);
  if (fromEnd === 0) {
    return scale === '24h' ? 'Now' : 'Today';
  }
  const ticks: Readonly<Record<ActivityChartScale, () => string>> = {
    '24h': () => (start.getHours() % 6 === 0 ? ACTIVITY_FEED_TIME_FORMAT.format(slot.startMs) : ''),
    '7d': () => ACTIVITY_FEED_DAY_FORMAT.format(slot.startMs).split(',')[0],
    '30d': () => (fromEnd % 7 === 0 ? ACTIVITY_FEED_SHORT_DATE_FORMAT.format(slot.startMs) : ''),
    '90d': () => (start.getDate() === 1 ? ACTIVITY_FEED_MONTH_FORMAT.format(slot.startMs) : ''),
  };
  return ticks[scale]();
}

/**
 * Turns the overview's slots into drawable bars: blue height by activity
 * against the busiest slot, a red cap where a line failed, and the selection
 * marked with the other bars dimmed.
 *
 * @param slots The chart slots, oldest first.
 * @param scale The chart scale.
 * @param selection The picked range or the drag in progress, if any.
 * @returns The bars.
 */
export function toChartBars(slots: readonly ActivityChartSlot[], scale: ActivityChartScale, selection: ActivityRange | undefined): readonly ActivityChartBarModel[] {
  const busiest = Math.max(1, ...slots.map((slot) => slot.count));
  return slots.map((slot, index) => {
    const state: ActivityChartBarState = selection === undefined ? 'idle' : overlaps(slot, selection) ? 'selected' : 'dimmed';
    return {
      key: slot.startMs,
      heightPercent: slot.count === 0 ? 0 : Math.max(ACTIVITY_MIN_BAR_PERCENT, (slot.count / busiest) * 100),
      hasFailure: slot.failed > 0,
      label: `${formatSpan(slot, scale)} · ${formatCounts(slot)}`,
      tick: formatTick(slot, scale, index, slots.length),
      state,
    };
  });
}

/**
 * The range a drag across bars selects, from the first bar's start to the
 * last bar's end and never past now. Clicking the one selected slot again
 * clears it (design, Drag across bars).
 *
 * @param slots The chart slots, oldest first.
 * @param anchor The bar the drag started on.
 * @param current The bar the drag ended on.
 * @param range The picked range before the drag.
 * @param nowMs The current time.
 * @returns The new range, or undefined to clear it.
 */
export function selectionFromDrag(
  slots: readonly ActivityChartSlot[],
  anchor: number,
  current: number,
  range: ActivityRange | undefined,
  nowMs: number,
): ActivityRange | undefined {
  const first = slots[Math.min(anchor, current)];
  const last = slots[Math.max(anchor, current)];
  const next = { fromMs: first.startMs, toMs: Math.min(last.endMs - 1, nowMs) };
  const isSameSlot = anchor === current && range?.fromMs === next.fromMs && range.toMs === next.toMs;
  return isSameSlot ? undefined : next;
}
