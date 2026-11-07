import { useCallback, useMemo, useState } from 'react';
import type { ActivityFeedSource } from '../feed-source/feed-source.types';
import type { ActivityFeedLine } from '../feed-source/feed.types';
import { toActivityReadValue } from '../ui/ActivityRunStory/activity-time.helpers';
import { readDrawerStoredReport, toDrawerReportChoices } from './drawer-reading.helpers';
import { pickDrawerOccurrenceId } from './drawer-window-error.helpers';
import type { DrawerPickedOccurrence } from './drawer.types';
import { useDrawerFeedRead } from './use-drawer-feed-read';

/**
 * Owns the stored report of a line with a reading: its own, or the one picked
 * in a Bridge off group. One report is read at a time, and only while the Data
 * tab shows it, so a group of many reports costs one read per pick.
 *
 * @param feedSource The feed port that reads a report.
 * @param line The open line.
 * @param lineKey The open line's key.
 * @param shown Whether the Data tab of the technical view is open.
 * @returns The reports, the shown one, its read status and payload, and the pick and retry callbacks.
 */
export function useDrawerStoredReport(feedSource: ActivityFeedSource, line: ActivityFeedLine, lineKey: string, shown: boolean) {
  // 1. Refs

  // 2. State
  const [picked, setPicked] = useState<DrawerPickedOccurrence | undefined>();

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations (the read depends on the pick, derived below)

  // 5. Derived State (useMemo)
  const reports = useMemo(() => toDrawerReportChoices(line), [line]);
  const selectedReportId = pickDrawerOccurrenceId(reports, picked, lineKey);
  const { read, retry: retryReport } = useDrawerFeedRead(feedSource, shown ? selectedReportId : undefined, readDrawerStoredReport);

  // 6. Callbacks (useCallback calling pure helpers)
  const pickReport = useCallback(
    (id: number) => {
      setPicked({ lineKey, id });
    },
    [lineKey],
  );

  // 7. Effects

  return { reports, selectedReportId, reportStatus: read?.status, reportJson: toActivityReadValue(read), pickReport, retryReport };
}
