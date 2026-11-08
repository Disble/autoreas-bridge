import { toSilenceWords } from '../feed/activity-feed-rows.helpers';
import type { ActivityFeedLine, ActivitySilenceReport, ActivityTabletSilence } from '../feed-source/feed.types';
import { DRAWER_HOUR_MS, DRAWER_SILENCE_WORDS } from './drawer.constants';
import type { DrawerDataBlock, DrawerSection, DrawerSummaryInput } from './drawer.types';
import { drawerFact, formatDrawerTime, formatDrawerWhen } from './drawer-format.helpers';

/**
 * The drawer header of a tablet silence: the row's subject and detail.
 *
 * @param feedLine The open line.
 * @returns The title and phrase; undefined for any other line.
 */
export function toDrawerSilenceHeader(feedLine: ActivityFeedLine): { readonly title: string; readonly phrase: string } | undefined {
  if (feedLine.silence === undefined) {
    return undefined;
  }
  const { subject, detail } = toSilenceWords(feedLine.silence);
  return { title: subject, phrase: detail };
}

/** A time of the silence: its clock time, with the date when it falls on another day than the line. */
function momentWords(ms: number, lineAtMs: number): string {
  const sameDay = new Date(ms).toDateString() === new Date(lineAtMs).toDateString();
  return sameDay ? formatDrawerTime(ms) : formatDrawerWhen(ms);
}

/** When a bounding report was received, or the hour it was heard in when only its hourly summary says so. */
function reportWords(report: ActivitySilenceReport, lineAtMs: number): string {
  if (report.hourStartMs === undefined) {
    return momentWords(report.receivedAtMs, lineAtMs);
  }
  return `in the ${momentWords(report.hourStartMs, lineAtMs)} – ${formatDrawerTime(report.hourStartMs + DRAWER_HOUR_MS)} hour`;
}

/**
 * The tablet silence presenter (S6 P4): what it means, then the times it
 * rests on: the last report, the report that ended it, the Bridge start and,
 * when Bridge stopped first, the stop.
 *
 * @param input The summary input.
 * @returns The sections; empty for any other line.
 */
export function silenceSections(input: DrawerSummaryInput): readonly DrawerSection[] {
  const { silence, line } = input.line;
  if (silence === undefined) {
    return [];
  }
  const words = (ms: number) => momentWords(ms, line.atMs);
  const rows = [
    drawerFact('last', DRAWER_SILENCE_WORDS.last, reportWords(silence.lastReport, line.atMs)),
    ...(silence.nextReport === undefined ? [] : [drawerFact('next', DRAWER_SILENCE_WORDS.next, reportWords(silence.nextReport, line.atMs))]),
    drawerFact('started', DRAWER_SILENCE_WORDS.started, words(silence.bridgeStartedAtMs)),
    ...(silence.bridgeStoppedAtMs === undefined ? [] : [drawerFact('stopped', DRAWER_SILENCE_WORDS.stopped, words(silence.bridgeStoppedAtMs))]),
  ];
  return [
    { kind: 'text', key: 'meaning', text: DRAWER_SILENCE_WORDS.meaning },
    { kind: 'facts', key: 'when', title: '', rows },
  ];
}

/** A bounding report as the Data tab names it: its receipt time, or the stored hour it was heard in. */
function storedReport(report: ActivitySilenceReport): Readonly<Record<string, string | number>> {
  if (report.hourStartMs === undefined) {
    return { kind: report.kind, reported_at_ms: report.receivedAtMs };
  }
  return { kind: report.kind, hour_start_ms: report.hourStartMs };
}

/**
 * The Data tab of a tablet silence: what it was read from, since nothing is stored for it.
 *
 * @param silence The silence.
 * @returns The one block.
 */
export function silenceDataBlocks(silence: ActivityTabletSilence): readonly DrawerDataBlock[] {
  const readFrom = {
    device_id: silence.deviceId,
    last_report: storedReport(silence.lastReport),
    next_report: silence.nextReport === undefined ? undefined : storedReport(silence.nextReport),
    bridge_started_at_ms: silence.bridgeStartedAtMs,
    bridge_stopped_at_ms: silence.bridgeStoppedAtMs,
  };
  return [{ label: DRAWER_SILENCE_WORDS.data, raw: JSON.stringify(readFrom) }];
}
