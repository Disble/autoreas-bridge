import { ListActivityRecorder, SearchActivityHistory } from '../../../../wailsjs/go/desktop/App';
import type { activityread } from '../../../../wailsjs/go/models';
import { EventsOn } from '../../../../wailsjs/runtime/runtime';
import { createRuntimeSubscription, invokeGoBinding } from '../../../infrastructure/wails-bindings.helpers';
import { ACTIVITY_RECORDER_EVENT_NAME, ACTIVITY_RUNTIME_UNAVAILABLE_MESSAGE } from '../activity-source/activity-source.constants';
import { mapActivityRecorderEntry } from '../activity-source/activity-source.helpers';
import type { ActivityRecorderEntry } from '../activity-source/activity.types';
import { ACTIVITY_KNOWN_LINE_MARKS, HISTORY_SOURCE_STATE } from './history-source.constants';
import type {
  ActivityCalendarDay,
  ActivityHistoryView,
  ActivityLedgerDay,
  ActivityLedgerLine,
  ActivityLineMark,
  ActivityRecorderPage,
} from './history.types';
import type { HistorySource } from './history-source.types';

/** Narrows a Go mark onto the known union; undefined for a mark the UI cannot label. */
function toKnownMark(mark: string): ActivityLineMark | undefined {
  return ACTIVITY_KNOWN_LINE_MARKS.find((known) => known === mark);
}

/** Maps one Go calendar square. */
function mapCalendarDay(day: activityread.CalendarDay): ActivityCalendarDay {
  return { dayStartMs: day.DayStartMS, total: day.Total, hasData: day.HasData, hasIncident: day.HasIncident };
}

/** Maps one Go ledger line; a nil phone time becomes undefined and unknown marks are dropped. */
function mapLedgerLine(line: activityread.LedgerLine): ActivityLedgerLine {
  return {
    kind: line.Kind,
    id: line.ID,
    atMs: line.AtMS,
    phoneAtMs: line.PhoneAtMS ?? undefined,
    domain: line.Domain,
    source: line.Source,
    level: line.Level,
    title: line.Title,
    detail: line.Detail,
    correlationId: line.CorrelationID,
    // Stryker disable next-line ArrayDeclaration: equivalent; a mutant element is not a known mark and is filtered out, so nil still yields [].
    marks: (line.Marks ?? []).map(toKnownMark).filter((mark) => mark !== undefined),
  };
}

/** Maps one Go day group. */
function mapLedgerDay(day: activityread.LedgerDay): ActivityLedgerDay {
  return { dayStartMs: day.DayStartMS, lines: (day.Lines ?? []).map(mapLedgerLine) };
}

/**
 * Converts one generated Go HistoryView into the readonly frontend contract.
 *
 * @param view The payload `SearchActivityHistory` resolved with.
 * @returns The History page the tab renders.
 */
export function mapActivityHistoryView(view: activityread.HistoryView): ActivityHistoryView {
  return {
    calendar: (view.Calendar ?? []).map(mapCalendarDay),
    days: (view.Days ?? []).map(mapLedgerDay),
    nextCursor: view.NextCursor,
  };
}

/**
 * Maps one recorder row, or returns undefined for a source the UI does not
 * know, so backend drift drops one row instead of breaking the list or the
 * live callback.
 *
 * @param entry The Go RecorderEntry.
 * @returns The recorder row, or undefined when its source is unknown.
 */
function tryMapActivityRecorderEntry(entry: activityread.RecorderEntry): ActivityRecorderEntry | undefined {
  try {
    return mapActivityRecorderEntry(entry);
  } catch {
    // An unknown source is backend drift: the row is dropped below.
  }
  return undefined;
}

/**
 * Converts one generated Go RecorderPage, skipping rows from an unknown source.
 *
 * @param page The payload `ListActivityRecorder` resolved with.
 * @returns The recorder page.
 */
export function mapActivityRecorderPage(page: activityread.RecorderPage): ActivityRecorderPage {
  return {
    // Stryker disable next-line ArrayDeclaration: equivalent; any mutant element fails mapping and is filtered out, so nil still yields [].
    entries: (page.Entries ?? []).map(tryMapActivityRecorderEntry).filter((entry) => entry !== undefined),
    nextCursor: page.NextCursor,
  };
}

/** Rejects a read whose bindings never attached; the view shows its failure state. */
function rejectRuntimeUnavailable(): Promise<never> {
  return Promise.reject(new Error(ACTIVITY_RUNTIME_UNAVAILABLE_MESSAGE));
}

/**
 * Returns the shared History source over the generated Wails bindings,
 * creating it on first use.
 *
 * @returns The shared HistorySource.
 */
export function createHistorySource(): HistorySource {
  if (HISTORY_SOURCE_STATE.sharedSource !== null) {
    return HISTORY_SOURCE_STATE.sharedSource;
  }

  const recorderSubscription = createRuntimeSubscription<ActivityRecorderEntry>((emit) => {
    return EventsOn(ACTIVITY_RECORDER_EVENT_NAME, (payload: activityread.RecorderEntry) => {
      const entry = tryMapActivityRecorderEntry(payload);
      if (entry !== undefined) {
        emit(entry);
      }
    });
  });

  const source: HistorySource = {
    searchHistory(where, cursor, limit) {
      return invokeGoBinding('SearchActivityHistory', () => SearchActivityHistory(where, cursor, limit), rejectRuntimeUnavailable).then(
        mapActivityHistoryView,
      );
    },
    listRecorder(cursor, limit) {
      return invokeGoBinding('ListActivityRecorder', () => ListActivityRecorder(cursor, limit), rejectRuntimeUnavailable).then(mapActivityRecorderPage);
    },
    subscribeRecorder(listener) {
      return recorderSubscription.subscribe(listener);
    },
  };

  HISTORY_SOURCE_STATE.sharedSource = source;
  return source;
}
