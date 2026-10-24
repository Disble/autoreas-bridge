import type { DateValue, RangeValue } from '@heroui/react';
import type { Time } from '@internationalized/date';
import type { ActivityChartScale, ActivityFeedLine, ActivityFeedOrigin, ActivityFeedType } from '../feed-source/feed.types';

/** A picked time range, epoch milliseconds, both ends inclusive. */
export interface ActivityRange {
  /** Oldest instant of the range. */
  readonly fromMs: number;
  /** Newest instant of the range. */
  readonly toMs: number;
}

/** Everything the toolbar and the chart decide about what the feed reads. */
export interface ActivityFeedFilters {
  /** Scale of the chart; without a range it is also the feed's window. */
  readonly scale: ActivityChartScale;
  /** The picked range; undefined reads the scale's whole window. */
  readonly range: ActivityRange | undefined;
  /** Origin filter. */
  readonly origin: ActivityFeedOrigin;
  /** Selected type toggles, toolbar order. Bridge lines ignore them. */
  readonly types: readonly ActivityFeedType[];
  /** Whether the failure switch is on: only the failures of the selected types show. */
  readonly failuresOnly: boolean;
  /** When the window was last computed, epoch milliseconds; the scale's window ends here. */
  readonly anchorMs: number;
}

/** Request state of a read. */
export type ActivityReadStatus = 'loading' | 'ready' | 'failed';

/** The health mark of a feed row. */
export type ActivityRowHealth = 'failed' | 'slow' | 'ok';

/** A row's repeat badge: `×1,912`, with `1,912 times` as its tooltip. */
export interface ActivityRowRepeat {
  /** Badge text, `×22`. */
  readonly badge: string;
  /** Tooltip and accessible name, `22 times`. */
  readonly label: string;
}

/** One drawable feed row. */
export interface ActivityFeedRowModel {
  /** `kind:id`, unique across the feed. */
  readonly key: string;
  /** Local time, `14:35`. */
  readonly time: string;
  /** Which origin icon shows. */
  readonly origin: ActivityFeedLine['origin'];
  /** Tooltip and accessible name of the origin icon, with the health. */
  readonly originLabel: string;
  /** Red, amber or plain icon tile. */
  readonly health: ActivityRowHealth;
  /** What the line is about. */
  readonly subject: string;
  /** One short fact, such as `episode 0 → 1` or `2 failed`; empty when the subject says it all. */
  readonly detail: string;
  /** The `×N` badge when the line stands for several stored records; undefined for one. */
  readonly repeat: ActivityRowRepeat | undefined;
  /** Whether the drawer shows this line. */
  readonly isOpen: boolean;
  /** Whether the row offers "Copy for AI": only a failed row does (mockup row actions). */
  readonly canCopy: boolean;
  /** The stored line the drawer opens. */
  readonly line: ActivityFeedLine;
}

/** One drawable day group. */
export interface ActivityFeedDayModel {
  /** Unique key of the group. */
  readonly key: string;
  /** Sticky header, `Today · Thu, Oct 22`. */
  readonly label: string;
  /** The day's rows, newest first. */
  readonly rows: readonly ActivityFeedRowModel[];
}

/** Which resolved view the feed renders. */
export type ActivityFeedResolvedView = 'rows' | 'no-types' | 'empty';

/** Whether a bar is inside, outside or unrelated to the current selection. */
export type ActivityChartBarState = 'selected' | 'dimmed' | 'idle';

/** How tightly the chart packs its bars: past 24 bars they sit closer, as the mockup's 30 and 90 day scales. */
export type ActivityChartDensity = 'sparse' | 'dense';

/** One drawable chart bar. */
export interface ActivityChartBarModel {
  /** Unique key: the slot start. */
  readonly key: number;
  /** Fill height, percent of the busiest slot; a gap fills the whole slot. */
  readonly heightPercent: number;
  /** Share of the slot's lines that failed, 0–100: the red part of the bar. */
  readonly failPercent: number;
  /** Whether the slot has no lines: drawn as a hatched full-height gap (mockup `.ax-bar.off`). */
  readonly isGap: boolean;
  /** Tooltip and accessible name, from the slot's own counts. */
  readonly label: string;
  /** Axis tick under the bar; empty for none. */
  readonly tick: string;
  /** Whether the tick is Today, drawn in the foreground color. */
  readonly isTodayTick: boolean;
  /** Whether this is the newest bar, whose tick aligns to the chart's end. */
  readonly isNow: boolean;
  /** Selection state. */
  readonly state: ActivityChartBarState;
}

/** One type toggle with its counts. */
export interface ActivityTypeToggleModel {
  /** The type. */
  readonly type: ActivityFeedType;
  /** Visible name. */
  readonly label: string;
  /** Lines of the type in the range and origin; undefined while unknown. */
  readonly lines: number | undefined;
  /** Failed lines of the type; 0 hides the red chip. */
  readonly failed: number;
}

/** The calendar value of the range field. */
export type ActivityCalendarRange = RangeValue<DateValue> | null;

/** The start and end times of the range picker. */
export interface ActivityRangeTimes {
  /** The time on the start day. */
  readonly start: Time;
  /** The time on the end day; its whole minute is inside the range. */
  readonly end: Time;
}

/** Options accepted by `useActivityFeedKeyboardScope`. */
export interface UseActivityFeedKeyboardScopeOptions {
  /** Whether the detail drawer shows a line. */
  readonly isDrawerOpen: boolean;
  /** Opens the newer feed line. */
  readonly onPrevious: () => void;
  /** Opens the older feed line. */
  readonly onNext: () => void;
  /** Closes the drawer. */
  readonly onClose: () => void;
}

/** The fields of a paired device the phone status line reads (the `getConnectedDevices` binding). */
export interface ActivityPhoneDevice {
  /** `connected` while the phone holds a live connection. */
  readonly connection_status: string;
  /** The phone's last contact, epoch milliseconds; 0 when it never synced. */
  readonly last_seen_at_ms: number;
}

/** The phone status line under the Activity title (S13). */
export interface ActivityPhoneStatusModel {
  /** Whether any paired phone is connected: a green dot, else a muted one. */
  readonly isConnected: boolean;
  /** "Phone connected · last sync 5m ago" or "Phone offline · last sync 2h ago". */
  readonly label: string;
}
