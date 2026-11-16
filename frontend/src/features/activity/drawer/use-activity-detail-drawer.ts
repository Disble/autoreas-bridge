import { useCallback, useMemo } from 'react';
import { BRIDGE_ACTIVITY_FEED_SOURCE, BRIDGE_ACTIVITY_SOURCE } from '../../../shared/query/bridge-runtime/bridge-runtime.constants';
import type { ActivitySource } from '../../../shared/contracts/activity.types';
import type { ActivityFeedLine } from '../../../shared/contracts/activity-feed.types';
import type { ActivityFeedSource } from '../../../shared/contracts/activity.types';
import { readActivityIncident } from '../ui/ActivityIncidents/activity-incident-detail.helpers';
import { readActivityRunStory } from '../ui/ActivityRunStory/activity-run-story.helpers';
import { toActivityReadValue } from '../ui/ActivityRunStory/activity-time.helpers';
import { useActivityCopy } from '../ui/ActivityRunStory/use-activity-copy';
import { useActivityRead } from '../ui/ActivityRunStory/use-activity-read';
import { readDrawerChangeContext, readDrawerEvent, toDrawerBodyStatus, toDrawerChangeKey, toDrawerEventId, toDrawerEventMetadata, toDrawerStoryId } from './drawer-reads.helpers';
import { useDrawerFeedRead } from './use-drawer-feed-read';
import { toDrawerHeader, toDrawerSummary } from './drawer-summary.helpers';
import { toDrawerCopyText } from './drawer-technical.helpers';
import type { DrawerSummaryInput } from './drawer.types';
import { useDrawerTechnical } from './use-drawer-technical';

/**
 * Owns the detail drawer of one open line: its incident read (when it has
 * one), its recorded metadata read (an event line, by event id), its change
 * context read (a change line, by change id: the anime's events and captures), the events sharing
 * its correlation id (`GetActivityRunStory`), the summary
 * model, the technical view (see `useDrawerTechnical`), and "Copy for AI".
 *
 * @param line The open line.
 * @param source The Activity port; the shared bridge source when omitted.
 * @param feedSource The feed port that reads one event; the shared bridge source when omitted.
 * @returns The drawer models and actions.
 */
export function useActivityDetailDrawer(line: ActivityFeedLine, source: ActivitySource = BRIDGE_ACTIVITY_SOURCE, feedSource: ActivityFeedSource = BRIDGE_ACTIVITY_FEED_SOURCE) {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks
  const { copy } = useActivityCopy();

  // 4. Queries/Mutations
  const incidentRead = useActivityRead(source, line.incidentId, readActivityIncident, 'incident');
  const eventRead = useDrawerFeedRead(feedSource, toDrawerEventId(line), readDrawerEvent, 'event');
  const changeRead = useDrawerFeedRead(feedSource, toDrawerChangeKey(line), readDrawerChangeContext, 'change-context');
  const storyRead = useActivityRead(source, toDrawerStoryId(line), readActivityRunStory, 'run-story');

  // 5. Derived State (useMemo)
  const incident = toActivityReadValue(incidentRead.read);
  const event = toActivityReadValue(eventRead.read);
  const story = toActivityReadValue(storyRead.read);
  const change = toActivityReadValue(changeRead.read);
  const changeFailed = changeRead.read?.status === 'failed';
  const metadata = useMemo(() => toDrawerEventMetadata(event), [event]);
  const input: DrawerSummaryInput = useMemo(() => ({ line, incident, story, change, changeFailed, metadata, nowMs: Date.now() }), [line, incident, story, change, changeFailed, metadata]);
  const status = toDrawerBodyStatus([incidentRead.read, eventRead.read]);
  const header = useMemo(() => toDrawerHeader(line), [line]);
  const summary = useMemo(() => toDrawerSummary(input), [input]);
  const technicalView = useDrawerTechnical(source, feedSource, line, incident, input);
  const { technical, reportJson } = technicalView;

  // 6. Callbacks (useCallback calling pure helpers)
  const { retry: retryIncident } = incidentRead;
  const { retry: retryEvent } = eventRead;
  const { retry: retryChange } = changeRead;
  const retry = useCallback(() => {
    retryIncident();
    retryEvent();
    retryChange();
  }, [retryIncident, retryEvent, retryChange]);

  const copyForAi = useCallback(() => {
    copy(toDrawerCopyText(input, technical, reportJson));
  }, [copy, input, reportJson, technical]);

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
