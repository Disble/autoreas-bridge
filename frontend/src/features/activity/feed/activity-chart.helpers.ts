import type { ActivityChartScale, ActivityChartSlot, ActivityFeedType } from '../feed-source/feed.types';
import {
  ACTIVITY_FEED_COUNT_FORMAT,
  ACTIVITY_FEED_DAY_FORMAT,
  ACTIVITY_FEED_MOMENT_FORMAT,
  ACTIVITY_FEED_MONTH_FORMAT,
  ACTIVITY_FEED_SHORT_DATE_FORMAT,
  ACTIVITY_FEED_TIME_FORMAT,
  ACTIVITY_FEED_WEEKDAY_FORMAT,
  ACTIVITY_MIN_BAR_PERCENT,
  ACTIVITY_TODAY_TICK,
} from './activity-feed.constants';
import type { ActivityChartBarModel, ActivityChartBarState, ActivityRange } from './activity-feed.types';

/** Whether a slot overlaps a range. */
function overlaps(slot: ActivityChartSlot, range: ActivityRange): boolean {
  return slot.startMs <= range.toMs && range.fromMs < slot.endMs;
}

/** `100 lines · 3 failed`, or `no activity` for a gap. */
function formatCounts(slot: ActivityChartSlot): string {
  if (slot.count === 0) {
    return 'no activity';
  }
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

/**
 * The axis tick under a bar, as the mockup draws it: 24 h every third hour
 * (`15`, `18`) with midnight as Today; 7 days `Sat 17`; 30 days every seventh
 * day back from today; 90 days the month on its first day. The newest daily
 * bar reads Today.
 */
function formatTick(slot: ActivityChartSlot, scale: ActivityChartScale, index: number, count: number): string {
  const fromEnd = count - 1 - index;
  const start = new Date(slot.startMs);
  if (scale === '24h') {
    if (start.getHours() === 0) {
      return ACTIVITY_TODAY_TICK;
    }
    return start.getHours() % 3 === 0 ? String(start.getHours()).padStart(2, '0') : '';
  }
  if (fromEnd === 0) {
    return ACTIVITY_TODAY_TICK;
  }
  const ticks: Readonly<Record<Exclude<ActivityChartScale, '24h'>, () => string>> = {
    '7d': () => `${ACTIVITY_FEED_WEEKDAY_FORMAT.format(slot.startMs)} ${start.getDate()}`,
    '30d': () => (fromEnd % 7 === 0 ? ACTIVITY_FEED_SHORT_DATE_FORMAT.format(slot.startMs) : ''),
    '90d': () => (start.getDate() === 1 ? ACTIVITY_FEED_MONTH_FORMAT.format(slot.startMs) : ''),
  };
  return ticks[scale]();
}

/**
 * The slots the bars draw: the overview's, which count what the table shows,
 * or every slot empty when no section is selected. Go counts every type for an
 * empty set, while the table then lists nothing (`toFeedQuery`), so the bars
 * follow the table instead of Go's default.
 *
 * @param slots The overview's slots, oldest first.
 * @param types The selected sections.
 * @returns The slots to draw, with the same spans.
 */
export function toTableSlots(slots: readonly ActivityChartSlot[], types: readonly ActivityFeedType[]): readonly ActivityChartSlot[] {
  if (types.length > 0) {
    return slots;
  }
  return slots.map((slot) => ({ ...slot, count: 0, failed: 0 }));
}

/**
 * Turns the overview's slots into drawable bars: blue height by activity
 * against the busiest slot, a red part sized to the share of failed lines, a hatched gap
 * where nothing was recorded, and the selection marked with the other bars
 * dimmed. A gap does not claim the bridge was off: no stop is stored.
 *
 * @param slots The chart slots, oldest first.
 * @param scale The chart scale.
 * @param selection The picked range or the drag in progress, if any.
 * @returns The bars.
 */
export function toChartBars(slots: readonly ActivityChartSlot[], scale: ActivityChartScale, selection: ActivityRange | undefined): readonly ActivityChartBarModel[] {
  const busiest = Math.max(1, ...slots.map((slot) => slot.count));
  return slots.map((slot, index) => {
    const tick = formatTick(slot, scale, index, slots.length);
    const state: ActivityChartBarState = selection === undefined ? 'idle' : overlaps(slot, selection) ? 'selected' : 'dimmed';
    return {
      key: slot.startMs,
      heightPercent: slot.count === 0 ? 100 : Math.max(ACTIVITY_MIN_BAR_PERCENT, (slot.count / busiest) * 100),
      failPercent: slot.count === 0 ? 0 : Math.min(100, (slot.failed / slot.count) * 100),
      isGap: slot.count === 0,
      label: `${formatSpan(slot, scale)} · ${formatCounts(slot)}`,
      tick,
      isTodayTick: tick === ACTIVITY_TODAY_TICK,
      isNow: index === slots.length - 1,
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
  // The current hour's selection ends at the now of the click that made it, so a later click
  // matches it by its start and slot, not by an end that moved with the clock.
  const isSameSlot = anchor === current && range?.fromMs === next.fromMs && range.toMs < last.endMs;
  return isSameSlot ? undefined : next;
}
