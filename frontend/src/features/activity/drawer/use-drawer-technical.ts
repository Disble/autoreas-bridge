import { useCallback, useMemo, useState } from 'react';
import type { ActivityIncidentDetail } from '../activity-source/activity-incident.types';
import type { ActivitySource } from '../activity-source/activity-source.types';
import type { ActivityFeedLine } from '../feed-source/feed.types';
import { readActivityRequest } from '../ui/ActivityIncidents/activity-request-detail.helpers';
import { toActivityReadValue } from '../ui/ActivityRunStory/activity-time.helpers';
import { useActivityRead } from '../ui/ActivityRunStory/use-activity-read';
import type { DrawerPickedGroup } from './drawer-reads.helpers';
import { pickDrawerGroup, toDrawerLineKey } from './drawer-reads.helpers';
import { pickDrawerTab, toDrawerDataBlocks, toDrawerEventRows, toDrawerEventsEmpty, toDrawerRequestGroups, toDrawerRequestPanel, toDrawerTechnicalTabs, toDrawerWindowErrorDetail } from './drawer-technical.helpers';
import type { DrawerSummaryInput, DrawerTechnicalTab } from './drawer.types';

/**
 * Owns the technical view of the open line: the toggle and tab (which survive
 * ↑ / ↓ because the drawer stays mounted while a line is open), the request
 * groups, the picked group and its request read, and the events and data tabs.
 *
 * @param source The Activity port that reads the picked request.
 * @param line The open line.
 * @param incident Its incident occurrence, once read.
 * @param input The summary input the events and data tabs read.
 * @returns The technical models and the callbacks that drive them.
 */
export function useDrawerTechnical(source: ActivitySource, line: ActivityFeedLine, incident: ActivityIncidentDetail | undefined, input: DrawerSummaryInput) {
  // 1. Refs

  // 2. State
  const [technical, setTechnical] = useState(false);
  const [chosenTab, setChosenTab] = useState<DrawerTechnicalTab>('requests');
  const [picked, setPicked] = useState<DrawerPickedGroup | undefined>();

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations (the request read depends on the picked group, derived below)

  // 5. Derived State (useMemo)
  const lineKey = toDrawerLineKey(line);
  const tabs = toDrawerTechnicalTabs(line);
  const tab = pickDrawerTab(tabs, chosenTab);
  const requestGroups = useMemo(() => toDrawerRequestGroups(incident), [incident]);
  const selectedGroup = pickDrawerGroup(requestGroups, picked, lineKey);
  const requestId = technical && tab === 'requests' ? selectedGroup?.latestRequestId : undefined;
  const requestRead = useActivityRead(source, requestId, readActivityRequest);
  const request = toActivityReadValue(requestRead.read);
  const requestPanel = selectedGroup !== undefined && request !== undefined ? toDrawerRequestPanel(selectedGroup, request) : undefined;
  const events = useMemo(() => toDrawerEventRows(input), [input]);
  const eventsEmpty = toDrawerEventsEmpty(input);
  const data = useMemo(() => toDrawerDataBlocks(input), [input]);
  const windowError = useMemo(() => toDrawerWindowErrorDetail(input), [input]);

  // 6. Callbacks (useCallback calling pure helpers)
  const toggleTechnical = useCallback(() => {
    setTechnical((open) => !open);
  }, []);

  const selectTab = useCallback((next: DrawerTechnicalTab) => {
    setChosenTab(next);
  }, []);

  const pickGroup = useCallback(
    (groupKey: string) => {
      setPicked({ lineKey, groupKey });
    },
    [lineKey],
  );

  // 7. Effects

  return {
    technical,
    tabs,
    tab,
    requestGroups,
    selectedGroupKey: selectedGroup?.key,
    requestStatus: requestRead.read?.status,
    requestPanel,
    events,
    eventsEmpty,
    data,
    windowError,
    toggleTechnical,
    selectTab,
    pickGroup,
    retryRequest: requestRead.retry,
  };
}
