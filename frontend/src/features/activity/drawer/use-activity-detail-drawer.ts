import { useCallback, useMemo } from 'react';
import { createActivitySource } from '../activity-source/activity-source.helpers';
import type { ActivitySource } from '../activity-source/activity-source.types';
import type { ActivityFeedLine } from '../feed-source/feed.types';
import { readActivityIncident } from '../ui/ActivityIncidents/activity-incident-detail.helpers';
import { readActivityRunStory } from '../ui/ActivityRunStory/activity-run-story.helpers';
import { toActivityReadValue } from '../ui/ActivityRunStory/activity-time.helpers';
import { useActivityCopy } from '../ui/ActivityRunStory/use-activity-copy';
import { useActivityRead } from '../ui/ActivityRunStory/use-activity-read';
import { toDrawerBodyStatus, toDrawerMetadata, toDrawerMetadataStoryId } from './drawer-reads.helpers';
import { toDrawerHeader, toDrawerSummary } from './drawer-summary.helpers';
import { toDrawerCopyText } from './drawer-technical.helpers';
import type { DrawerSummaryInput } from './drawer.types';
import { useDrawerTechnical } from './use-drawer-technical';

/**
 * Owns the detail drawer of one open line: its incident read (when it has
 * one), its recorded metadata read (an event with a correlation id), the
 * summary model, the technical view (see `useDrawerTechnical`), and
 * "Copy for AI".
 *
 * @param line The open line.
 * @param source The Activity port; the shared Wails source when omitted.
 * @returns The drawer models and actions.
 */
export function useActivityDetailDrawer(line: ActivityFeedLine, source: ActivitySource = createActivitySource()) {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks
  const { copy } = useActivityCopy();

  // 4. Queries/Mutations
  const incidentRead = useActivityRead(source, line.incidentId, readActivityIncident);
  const storyRead = useActivityRead(source, toDrawerMetadataStoryId(line), readActivityRunStory);

  // 5. Derived State (useMemo)
  const incident = toActivityReadValue(incidentRead.read);
  const story = toActivityReadValue(storyRead.read);
  const metadata = useMemo(() => toDrawerMetadata(story, line.line.id), [story, line.line.id]);
  const input: DrawerSummaryInput = useMemo(() => ({ line, incident, metadata, nowMs: Date.now() }), [line, incident, metadata]);
  const status = toDrawerBodyStatus([incidentRead.read, storyRead.read]);
  const header = useMemo(() => toDrawerHeader(line), [line]);
  const summary = useMemo(() => toDrawerSummary(input), [input]);
  const technicalView = useDrawerTechnical(source, line, incident, input);
  const { technical } = technicalView;

  // 6. Callbacks (useCallback calling pure helpers)
  const { retry: retryIncident } = incidentRead;
  const { retry: retryStory } = storyRead;
  const retry = useCallback(() => {
    retryIncident();
    retryStory();
  }, [retryIncident, retryStory]);

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
