import { formatActivityDuration } from '../ui/ActivityRunStory/activity-time.helpers';
import type { ActivityTabletSummary } from '../feed-source/feed.types';
import { DRAWER_PROCESS_DEATHS_TITLE, DRAWER_TABLET_TITLE } from './drawer.constants';
import type { DrawerFact, DrawerSection } from './drawer.types';
import { drawerFact, formatDrawerTime, formatDrawerWhen } from './drawer-format.helpers';

/** When a summary reached Bridge: its time, with the date when it arrived on another day than its hour. */
function receivedWords(tablet: ActivityTabletSummary, hourStartMs: number): string {
  const sameDay = new Date(tablet.receivedAtMs).toDateString() === new Date(hourStartMs).toDateString();
  return sameDay ? formatDrawerTime(tablet.receivedAtMs) : formatDrawerWhen(tablet.receivedAtMs);
}

/** One device's rows: its device when several reported, each stored count with its slowest attempt, its dropped reports and its arrival. */
function tabletRows(tablet: ActivityTabletSummary, hourStartMs: number, several: boolean): readonly DrawerFact[] {
  const counts = tablet.counts.map((count) =>
    drawerFact(`${count.triggerSource}-${count.outcome}`, `${count.triggerSource} · ${count.outcome}`, String(count.count), {
      labelMono: true,
      note: count.maxDurationMs === undefined ? undefined : `· slowest ${formatActivityDuration(count.maxDurationMs)}`,
    }),
  );
  return [
    ...(several ? [drawerFact('device', 'Device', tablet.deviceId, { mono: true })] : []),
    ...counts,
    drawerFact('dropped', 'Reports dropped', String(tablet.droppedCount)),
    drawerFact('received', 'Received', receivedWords(tablet, hourStartMs)),
  ];
}

/**
 * What each device reported for a traffic hour in its hourly summary (S6 P1),
 * as stored: one block per device, then its process deaths when it had any.
 * Nothing compares it with Bridge's own totals, and a code is shown as stored.
 *
 * @param tablets The hour's summaries, one per device.
 * @param hourStartMs The traffic hour.
 * @returns The sections; empty when no device reported the hour.
 */
export function tabletSections(tablets: readonly ActivityTabletSummary[], hourStartMs: number): readonly DrawerSection[] {
  const several = tablets.length > 1;
  return tablets.flatMap((tablet): readonly DrawerSection[] => {
    const deaths = tablet.processDeaths.map((death) => ({ key: `${death.processName}-${death.reason}`, time: death.processName, text: `${death.reason} · ×${death.count}`, failed: false }));
    return [
      { kind: 'facts', key: `tablet-${tablet.deviceId}`, title: DRAWER_TABLET_TITLE, rows: tabletRows(tablet, hourStartMs, several) },
      ...(deaths.length === 0 ? [] : [{ kind: 'list' as const, key: `deaths-${tablet.deviceId}`, title: DRAWER_PROCESS_DEATHS_TITLE, items: deaths }]),
    ];
  });
}
