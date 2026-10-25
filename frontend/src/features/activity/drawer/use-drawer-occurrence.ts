import { useCallback, useMemo, useState } from 'react';
import type { ActivityIncidentDetail } from '../activity-source/activity-incident.types';
import type { ActivitySource } from '../activity-source/activity-source.types';
import type { ActivityFeedSource } from '../feed-source/feed-source.types';
import { readActivityIncident } from '../ui/ActivityIncidents/activity-incident-detail.helpers';
import { toActivityReadValue } from '../ui/ActivityRunStory/activity-time.helpers';
import { useActivityRead } from '../ui/ActivityRunStory/use-activity-read';
import { readDrawerEvent, toDrawerBodyStatus, toDrawerEventMetadata } from './drawer-reads.helpers';
import { pickDrawerOccurrenceId, toDrawerOccurrenceEventId, toDrawerOccurrences, toDrawerOccurrenceStatus, toDrawerWindowErrorFromMetadata } from './drawer-window-error.helpers';
import type { DrawerPickedOccurrence, DrawerWindowErrorDetail } from './drawer.types';
import { useDrawerFeedRead } from './use-drawer-feed-read';

/**
 * Owns the occurrence picker of a repeated window error (S12, L16): this
 * occurrence shows the line's own stored error; picking an earlier one reads
 * its incident (`GetActivityIncident`), then the event that fired it
 * (`GetActivityEvent`), and shows that stored error instead.
 *
 * @param source The Activity port that reads an occurrence.
 * @param feedSource The feed port that reads its event.
 * @param lineKey The open line's key.
 * @param incident The line's incident, once read.
 * @param current The line's own window error; undefined for other lines.
 * @returns The occurrences, the shown one, its read status and error, and the pick and retry callbacks.
 */
export function useDrawerOccurrence(
  source: ActivitySource,
  feedSource: ActivityFeedSource,
  lineKey: string,
  incident: ActivityIncidentDetail | undefined,
  current: DrawerWindowErrorDetail | undefined,
) {
  // 1. Refs

  // 2. State
  const [picked, setPicked] = useState<DrawerPickedOccurrence | undefined>();

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations (each read depends on the pick, derived below)

  // 5. Derived State (useMemo)
  const occurrences = useMemo(() => (current === undefined ? [] : toDrawerOccurrences(incident)), [current, incident]);
  const selectedId = pickDrawerOccurrenceId(occurrences, picked, lineKey);
  const earlierId = selectedId === undefined || selectedId === occurrences[0]?.id ? undefined : selectedId;
  const occurrenceRead = useActivityRead(source, earlierId, readActivityIncident);
  const occurrence = toActivityReadValue(occurrenceRead.read);
  const eventId = earlierId === undefined ? undefined : toDrawerOccurrenceEventId(occurrence);
  const eventRead = useDrawerFeedRead(feedSource, eventId, readDrawerEvent);
  const event = toActivityReadValue(eventRead.read);
  const status = toDrawerOccurrenceStatus(toDrawerBodyStatus([occurrenceRead.read, eventRead.read]), earlierId !== undefined && occurrence !== undefined && eventId === undefined);
  const windowError = useMemo(() => {
    if (earlierId === undefined) {
      return current;
    }
    const metadata = toDrawerEventMetadata(event);
    return metadata === undefined || event === undefined ? undefined : toDrawerWindowErrorFromMetadata(metadata, event.message);
  }, [current, earlierId, event]);

  // 6. Callbacks (useCallback calling pure helpers)
  const pickOccurrence = useCallback(
    (id: number) => {
      setPicked({ lineKey, id });
    },
    [lineKey],
  );

  const { retry: retryIncident } = occurrenceRead;
  const { retry: retryEvent } = eventRead;
  const retryOccurrence = useCallback(() => {
    retryIncident();
    retryEvent();
  }, [retryIncident, retryEvent]);

  // 7. Effects

  return { occurrences, selectedOccurrenceId: selectedId, occurrenceStatus: status, windowError, pickOccurrence, retryOccurrence };
}
