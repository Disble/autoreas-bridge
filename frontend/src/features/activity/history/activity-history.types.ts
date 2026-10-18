import type { UIEvent } from 'react';
import type { Key } from '@heroui/react';
import type { ActivityWhere } from '../history-source/history.types';

/** How one calendar square is drawn: before recording began, a gap, or a recorded day. */
export type ActivityCalendarCellState = 'before' | 'gap' | 'data';

/** One square of the 90-day calendar, ready to draw. */
export interface ActivityCalendarCellModel {
  /** Day start, stable React key. */
  readonly key: number;
  /** Outline, dashed gap, or filled. */
  readonly state: ActivityCalendarCellState;
  /** Fill intensity 0-4 against the busiest day; 0 for a quiet or missing day. */
  readonly level: number;
  /** Whether an incident occurred that day: drawn as a red ring. */
  readonly hasIncident: boolean;
  /** Hover text with the day's numbers. */
  readonly title: string;
  /** Drawing classes: outline, dashed gap or fill, plus the incident ring. */
  readonly className: string;
}

/** The 90-day calendar, ready to draw. */
export interface ActivityCalendarModel {
  /** Empty slots before the first square so each column is one week. */
  readonly leadingBlanks: number;
  /** The squares, oldest first. */
  readonly cells: readonly ActivityCalendarCellModel[];
  /** Text alternative of the calendar image. */
  readonly summary: string;
}

/** One run of consecutive missing days after recording began. */
export interface ActivityGapRun {
  /** Start of the first missing day, epoch milliseconds. */
  readonly startMs: number;
  /** Start of the last missing day, epoch milliseconds. */
  readonly endMs: number;
}

/** Semantic color of a line chip. */
export type ActivityHistoryChipColor = 'warning' | 'danger';

/** One soft chip on a History line. */
export interface ActivityHistoryChipModel {
  /** Chip text, also its React key. */
  readonly label: string;
  /** Semantic color. */
  readonly color: ActivityHistoryChipColor;
}

/** One History line in plain words. */
export interface ActivityHistoryLineModel {
  /** `kind:id`, stable React key. */
  readonly key: string;
  /** Local bridge time, `17:31`. */
  readonly time: string;
  /** Phone time, shown only for a fact that arrived late. */
  readonly phoneTime: string | undefined;
  /** Plain-words title worded by Go. */
  readonly title: string;
  /** Secondary detail worded by Go. */
  readonly detail: string;
  /** Soft chips for the marks Go set. */
  readonly chips: readonly ActivityHistoryChipModel[];
}

/** One rendered block of the day list: a day group or a gap. */
export type ActivityHistoryItem =
  | {
      /** A day group. */
      readonly kind: 'day';
      /** `day:<start>`, stable React key. */
      readonly key: string;
      /** Local date, `Sun, Oct 18`. */
      readonly label: string;
      /** The day's lines, newest first. */
      readonly lines: readonly ActivityHistoryLineModel[];
    }
  | {
      /** A run of missing days. */
      readonly kind: 'gap';
      /** `gap:<start>`, stable React key. */
      readonly key: string;
      /** `No data · from … to …`. */
      readonly label: string;
      /** Why the gap may still fill. */
      readonly note: string;
    };

/** One option of the "where it happened" filter. */
export interface ActivityWhereOption {
  /** The Go filter value, also the toggle id. */
  readonly id: ActivityWhere;
  /** Visible label. */
  readonly label: string;
}

/** The History tab's first-page request: loading, failed, or resolved. */
export type ActivityHistoryRequestStatus = 'loading' | 'failed' | 'ready';

/** Which resolved view the History tab shows. */
export type ActivityHistoryResolvedView = 'first-run' | 'filtered-empty' | 'quiet' | 'days';

/** Props of the History tab. */
export interface ActivityHistoryProps {
  /** Opens pairing, the first-run action when nothing was ever recorded. */
  readonly onPairPhone: () => void;
}

/** Props of the where filter. */
export interface ActivityWhereFilterProps {
  /** The selected filter. */
  readonly where: ActivityWhere;
  /** Applies a new selection from the toggle group. */
  readonly onWhereChange: (keys: Set<Key>) => void;
}

/** Props of the calendar. */
export interface ActivityHistoryCalendarProps {
  /** The drawable calendar. */
  readonly model: ActivityCalendarModel;
}

/** Props of the day list. */
export interface ActivityHistoryDayListProps {
  /** Day groups and gap blocks, newest first. */
  readonly items: readonly ActivityHistoryItem[];
  /** Whether an older page is being read. */
  readonly isLoadingMore: boolean;
  /** Reads an older page near the bottom. */
  readonly onScroll: (event: UIEvent<HTMLDivElement>) => void;
}

/** Props of the resolved History card: the calendar plus the day list or its empty state. */
export interface ActivityHistoryResolvedProps extends ActivityHistoryDayListProps {
  /** The 90-day calendar. */
  readonly calendar: ActivityCalendarModel;
  /** Which resolved view the card shows; never `first-run`, which replaces the card. */
  readonly resolvedView: Exclude<ActivityHistoryResolvedView, 'first-run'>;
  /** Clears the where filter back to every source. */
  readonly showAll: () => void;
}

/** Props of the History failure alert. */
export interface ActivityHistoryFailureProps {
  /** Reads the first page again. */
  readonly retry: () => void;
}
