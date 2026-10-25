import type { activityread } from '../../../../wailsjs/go/models';
import { EventsOn } from '../../../../wailsjs/runtime/runtime';
import { createRuntimeSubscription } from '../../../infrastructure/wails-bindings.helpers';
import { ACTIVITY_RECORDER_EVENT_NAME } from '../activity-source/activity-source.constants';
import { mapActivityRecorderEntry } from '../activity-source/activity-source.helpers';
import type { ActivityRecorderEntry, ActivityRecorderPayload } from '../activity-source/activity.types';
import { ACTIVITY_KNOWN_LINE_MARKS, HISTORY_SOURCE_STATE } from './history-source.constants';
import type { ActivityLedgerLine, ActivityLineMark } from './history.types';
import type { HistorySource } from './history-source.types';

/** Narrows a Go mark onto the known union; undefined for a mark the UI cannot label. */
function toKnownMark(mark: string): ActivityLineMark | undefined {
  return ACTIVITY_KNOWN_LINE_MARKS.find((known) => known === mark);
}

/** Maps one Go ledger line; a nil phone time becomes undefined and unknown marks are dropped. The feed source maps its lines with it. */
export function mapLedgerLine(line: activityread.LedgerLine): ActivityLedgerLine {
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
    beforeJson: line.BeforeJSON,
    afterJson: line.AfterJSON,
    // Stryker disable next-line ArrayDeclaration: equivalent; a mutant element is not a known mark and is filtered out, so nil still yields [].
    marks: (line.Marks ?? []).map(toKnownMark).filter((mark) => mark !== undefined),
  };
}

/**
 * Maps one recorder row, or returns undefined for a source the UI does not
 * know, so backend drift drops one row instead of breaking the live callback.
 *
 * @param entry The recorder payload.
 * @returns The recorder row, or undefined when its source is unknown.
 */
function tryMapActivityRecorderEntry(entry: ActivityRecorderPayload): ActivityRecorderEntry | undefined {
  try {
    return mapActivityRecorderEntry(entry);
  } catch {
    // An unknown source is backend drift: the row is dropped below.
  }
  return undefined;
}

/**
 * Returns the shared History source over the Wails runtime events,
 * creating it on first use.
 *
 * @returns The shared HistorySource.
 */
export function createHistorySource(): HistorySource {
  if (HISTORY_SOURCE_STATE.sharedSource !== null) {
    return HISTORY_SOURCE_STATE.sharedSource;
  }

  const recorderSubscription = createRuntimeSubscription<ActivityRecorderEntry>((emit) => {
    return EventsOn(ACTIVITY_RECORDER_EVENT_NAME, (payload: ActivityRecorderPayload) => {
      const entry = tryMapActivityRecorderEntry(payload);
      if (entry !== undefined) {
        emit(entry);
      }
    });
  });

  const source: HistorySource = {
    subscribeRecorder(listener) {
      return recorderSubscription.subscribe(listener);
    },
  };

  HISTORY_SOURCE_STATE.sharedSource = source;
  return source;
}
