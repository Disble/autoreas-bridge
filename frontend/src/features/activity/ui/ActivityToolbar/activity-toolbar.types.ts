import type { Key } from '@heroui/react';
import type { CalendarDate, Time } from '@internationalized/date';
import type { ActivityCalendarRange, ActivityTypeToggleModel } from '../../feed/activity-feed.types';
import type { ActivityFeedOrigin } from '../../feed-source/feed.types';

/** Props of the failure switch. */
export interface ActivityFailureButtonProps {
  /** Whether the switch is on: the feed shows only the failures of the selected types. */
  readonly isOn: boolean;
  /** Failures of the selected types in the range and origin. */
  readonly count: number;
  /** Flips the switch. */
  readonly onToggle: () => void;
}

/** The range picker's unapplied pick: its days and its start and end times, a cleared time field as null. */
export interface ActivityRangeDraft {
  /** The picked days. */
  readonly days: ActivityCalendarRange;
  /** The start time. */
  readonly start: Time | null;
  /** The end time. */
  readonly end: Time | null;
  /** Whether a first day was pressed and the next press ends the range (mockup: `cal.end === null`). */
  readonly anchorPending: boolean;
}

/** The key-down facts that decide whether a key presses a calendar day. */
export interface ActivityDayKey {
  /** The pressed key. */
  readonly key: string;
  /** Whether the key is held down and repeating. */
  readonly repeat: boolean;
  /** The focused element: a day cell carries its date in `data-day`. */
  readonly target: EventTarget;
}

/** Props of the range picker's popover: a draft that only Apply commits. */
export interface ActivityRangePickerProps {
  /** Whether the popover is open. */
  readonly isOpen: boolean;
  /** Opens the popover on the picked range, or closes it dropping the draft. */
  readonly onOpenChange: (open: boolean) => void;
  /** The picked days of the draft. */
  readonly days: ActivityCalendarRange;
  /** The draft's start time. */
  readonly startTime: Time | null;
  /** The draft's end time. */
  readonly endTime: Time | null;
  /** Whether Apply can commit: days are picked and both times are set. */
  readonly canApply: boolean;
  /** Sets the draft's days. */
  readonly onDaysChange: (days: ActivityCalendarRange) => void;
  /** A pointer press on a day: the first press of a range picks that one day. */
  readonly onDayPress: (date: CalendarDate) => void;
  /** A key down inside the calendar, seen before the day handles it: Enter or Space on a day presses it exactly like a pointer. */
  readonly onCalendarKeyDown: (key: ActivityDayKey) => void;
  /** Sets the draft's start time. */
  readonly onStartTimeChange: (time: Time | null) => void;
  /** Sets the draft's end time. */
  readonly onEndTimeChange: (time: Time | null) => void;
  /** Commits the draft and closes. */
  readonly onApply: () => void;
  /** Clears the range and closes. */
  readonly onClear: () => void;
}

/** The range field's text and pickable days, derived from the filters. */
export interface ActivityRangeFieldModel {
  /** The range field's text: the picked range or the real window. */
  readonly rangeLabel: string;
  /** Whether a range is picked; the × shows only then. */
  readonly hasRange: boolean;
  /** First pickable day. */
  readonly calendarMin: CalendarDate;
  /** Last pickable day. */
  readonly calendarMax: CalendarDate;
}

/** Props of the range field and its picker. */
export interface ActivityRangeFieldProps extends ActivityRangeFieldModel {
  /** Clears the range from the × in the field. */
  readonly onClearRange: () => void;
  /** The picker's popover. */
  readonly picker: ActivityRangePickerProps;
}

/** Props of the feed toolbar. */
export interface ActivityToolbarProps {
  /** The range field and its picker. */
  readonly range: ActivityRangeFieldProps;
  /** The origin filter. */
  readonly origin: ActivityFeedOrigin;
  /** Applies the origin switch. */
  readonly onOriginChange: (keys: Set<Key>) => void;
  /** The type toggles with their counts. */
  readonly typeToggles: readonly ActivityTypeToggleModel[];
  /** The type group's selected keys. */
  readonly typeKeys: Set<Key>;
  /** Applies the type group's selection. */
  readonly onTypesChange: (keys: Set<Key>) => void;
  /** The failure switch. */
  readonly failure: ActivityFailureButtonProps;
}
