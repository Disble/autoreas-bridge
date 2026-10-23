import type { DateValue, RangeValue } from '@heroui/react';
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
  /** Whether the failure filter is on. */
  readonly failuresOnly: boolean;
  /** Failure types picked in the failure menu. */
  readonly failureTypes: readonly ActivityFeedType[];
  /** When the window was last computed, epoch milliseconds; the scale's window ends here. */
  readonly anchorMs: number;
}

/** Request state of a read. */
export type ActivityReadStatus = 'loading' | 'ready' | 'failed';

/** The health mark of a feed row. */
export type ActivityRowHealth = 'failed' | 'slow' | 'ok';

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
  /** What changed; empty when the stored line holds nothing more. */
  readonly detail: string;
  /** Whether an incident occurrence is linked to the line. */
  readonly hasIncident: boolean;
  /** Whether the drawer shows this line. */
  readonly isOpen: boolean;
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

/** One drawable chart bar. */
export interface ActivityChartBarModel {
  /** Unique key: the slot start. */
  readonly key: number;
  /** Fill height, percent of the busiest slot. */
  readonly heightPercent: number;
  /** Whether a line in the slot failed (red cap). */
  readonly hasFailure: boolean;
  /** Tooltip and accessible name, from the slot's own counts. */
  readonly label: string;
  /** Axis tick under the bar; empty for none. */
  readonly tick: string;
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

/** One row of the failure menu. */
export interface ActivityFailureRowModel {
  /** The failure type. */
  readonly type: ActivityFeedType;
  /** Visible name. */
  readonly label: string;
  /** Failed lines of the type in the range and origin. */
  readonly failed: number;
}

/** How the failure button shows (activity-ui-design-v2.md, Failure button, States). */
export type ActivityFailureButtonState = 'off' | 'open' | 'on';

/** The calendar value of the range field. */
export type ActivityCalendarRange = RangeValue<DateValue> | null;

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
