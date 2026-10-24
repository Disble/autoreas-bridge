import { useCallback, useMemo } from 'react';
import { createActivitySource } from '../activity-source/activity-source.helpers';
import type { ActivitySource } from '../activity-source/activity-source.types';
import type { ActivityFeedLine } from '../feed-source/feed.types';
import { createActivityFeedSource } from '../feed-source/feed-source.helpers';
import type { ActivityFeedSource } from '../feed-source/feed-source.types';
import { readActivityIncident } from '../ui/ActivityIncidents/activity-incident-detail.helpers';
import { readActivityRunStory } from '../ui/ActivityRunStory/activity-run-story.helpers';
import { toActivityReadValue } from '../ui/ActivityRunStory/activity-time.helpers';
import { useActivityCopy } from '../ui/ActivityRunStory/use-activity-copy';
import { useActivityRead } from '../ui/ActivityRunStory/use-activity-read';
import { toDrawerBodyStatus, toDrawerEventId, toDrawerEventMetadata, toDrawerStoryId } from './drawer-reads.helpers';
import { useDrawerEventRead } from './use-drawer-event-read';
import { toDrawerHeader, toDrawerSummary } from './drawer-summary.helpers';
import { toDrawerCopyText } from './drawer-technical.helpers';
import type { DrawerSummaryInput } from './drawer.types';
import { useDrawerTechnical } from './use-drawer-technical';

/**
 * Owns the detail drawer of one open line: its incident read (when it has
 * one), its recorded metadata read (an event line, by event id), the events sharing
 * its correlation id (`GetActivityRunStory`), the summary
 * model, the technical view (see `useDrawerTechnical`), and "Copy for AI".
 *
 * @param line The open line.
 * @param source The Activity port; the shared Wails source when omitted.
 * @param feedSource The feed port that reads one event; the shared Wails source when omitted.
 * @returns The drawer models and actions.
 */
export function useActivityDetailDrawer(line: ActivityFeedLine, source: ActivitySource = createActivitySource(), feedSource: ActivityFeedSource = createActivityFeedSource()) {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks
  const { copy } = useActivityCopy();

  // 4. Queries/Mutations
  const incidentRead = useActivityRead(source, line.incidentId, readActivityIncident);
  const eventRead = useDrawerEventRead(feedSource, toDrawerEventId(line));
  const storyRead = useActivityRead(source, toDrawerStoryId(line), readActivityRunStory);

  // 5. Derived State (useMemo)
  const incident = toActivityReadValue(incidentRead.read);
  const event = toActivityReadValue(eventRead.read);
  const story = toActivityReadValue(storyRead.read);
  const metadata = useMemo(() => toDrawerEventMetadata(event), [event]);
  const input: DrawerSummaryInput = useMemo(() => ({ line, incident, story, metadata, nowMs: Date.now() }), [line, incident, story, metadata]);
  const status = toDrawerBodyStatus([incidentRead.read, eventRead.read]);
  const header = useMemo(() => toDrawerHeader(line), [line]);
  const summary = useMemo(() => toDrawerSummary(input), [input]);
  const technicalView = useDrawerTechnical(source, feedSource, line, incident, input);
  const { technical } = technicalView;

  // 6. Callbacks (useCallback calling pure helpers)
  const { retry: retryIncident } = incidentRead;
  const { retry: retryEvent } = eventRead;
  const retry = useCallback(() => {
    retryIncident();
    retryEvent();
  }, [retryIncident, retryEvent]);

  const copyForAi = useCallback(() => {
    copy(toDrawerCopyText(input, technical));
  }, [copy, input, technical]);

  // 7. Effects

  return {
    header,
    status,
    summary,
    ...technicalView,
    retry,
    copyForAi,
  };
}
