import type { Key } from '@heroui/react';
import type { CalendarDate } from '@internationalized/date';
import type { RefObject } from 'react';
import type { ActivityCalendarRange, ActivityFailureButtonState, ActivityFailureRowModel, ActivityTypeToggleModel } from '../../feed/activity-feed.types';
import type { ActivityFeedOrigin } from '../../feed-source/feed.types';

/** Props of the failure button and its menu. */
export interface ActivityFailureButtonProps {
  /** Off, on with the menu open, or on with it closed. */
  readonly state: ActivityFailureButtonState;
  /** Failures in scope. */
  readonly count: number;
  /** The menu rows. */
  readonly rows: readonly ActivityFailureRowModel[];
  /** Selected menu rows. */
  readonly selectedKeys: Set<Key>;
  /** Rows with no failure. */
  readonly disabledKeys: Set<Key>;
  /** The pill and its menu; a press outside it closes the menu. */
  readonly groupRef: RefObject<HTMLDivElement | null>;
  /** The pill's press: off turns the filter on and opens the menu, then it opens or closes the menu. */
  readonly onToggle: () => void;
  /** Applies the menu's selection. */
  readonly onSelectionChange: (keys: Set<Key> | 'all') => void;
  /** Turns the failure filter off. */
  readonly onClear: () => void;
}

/** Props of the feed toolbar. */
export interface ActivityToolbarProps {
  /** The range field's text: the picked range or the real window. */
  readonly rangeLabel: string;
  /** Whether a range is picked; the × shows only then. */
  readonly hasRange: boolean;
  /** The calendar value of the picked range. */
  readonly calendarValue: ActivityCalendarRange;
  /** First pickable day. */
  readonly calendarMin: CalendarDate;
  /** Last pickable day. */
  readonly calendarMax: CalendarDate;
  /** Applies a calendar pick. */
  readonly onCalendarChange: (value: ActivityCalendarRange) => void;
  /** Clears the range. */
  readonly onClearRange: () => void;
  /** The origin filter. */
  readonly origin: ActivityFeedOrigin;
  /** Applies the origin switch. */
  readonly onOriginChange: (keys: Set<Key>) => void;
  /** The type toggles with their counts. */
  readonly typeToggles: readonly ActivityTypeToggleModel[];
  /** The type group's selected keys. */
  readonly typeKeys: Set<Key>;
  /** Whether the failure filter is on; the type group shows muted then. */
  readonly failuresOnly: boolean;
  /** Applies the type group's selection. */
  readonly onTypesChange: (keys: Set<Key>) => void;
  /** The failure button. */
  readonly failure: ActivityFailureButtonProps;
}
