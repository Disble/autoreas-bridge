import { describeActivityChange } from '../change-words/change-words.helpers';
import type { ActivityDownloadRun, ActivityFeedDay, ActivityFeedLine, ActivityFeedView, ActivityTrafficHour } from '../feed-source/feed.types';
import {
  ACTIVITY_BRIDGE_STARTED,
  ACTIVITY_FEED_COUNT_FORMAT,
  ACTIVITY_FEED_DAY_FORMAT,
  ACTIVITY_FEED_TIME_FORMAT,
  ACTIVITY_HOUR_MS,
  ACTIVITY_ORIGIN_LABELS,
  ACTIVITY_PHONE_REPORT_SUBJECTS,
  ACTIVITY_RUN_SUBJECT,
  ACTIVITY_RUN_TRIGGER_SUBJECTS,
  ACTIVITY_TRAFFIC_SUBJECT,
} from './activity-feed.constants';
import type { ActivityFeedDayModel, ActivityFeedRowModel, ActivityRowHealth } from './activity-feed.types';

/**
 * The key of a feed line: `kind:id`, unique across the feed.
 *
 * @param line The feed line.
 * @returns The key.
 */
export function feedLineKey(line: ActivityFeedLine): string {
  return `${line.line.kind}:${line.line.id}`;
}

/** `1 time` / `1,912 times`, as in the design's "Phone checked in · 39 times · 09:00 – 10:00". */
function formatCheckIns(count: number): string {
  return `${ACTIVITY_FEED_COUNT_FORMAT.format(count)} ${count === 1 ? 'time' : 'times'}`;
}

/** A traffic hour's detail: its totals and its hour. */
function describeTraffic(hour: ActivityTrafficHour): string {
  const failed = hour.failed > 0 ? ` · ${ACTIVITY_FEED_COUNT_FORMAT.format(hour.failed)} failed` : '';
  const span = `${ACTIVITY_FEED_TIME_FORMAT.format(hour.hourStartMs)} – ${ACTIVITY_FEED_TIME_FORMAT.format(hour.hourStartMs + ACTIVITY_HOUR_MS)}`;
  return `${formatCheckIns(hour.requests)}${failed} · ${span}`;
}

/** A run's detail: its stored status when not ok, its counts and its stored error. */
function describeRun(run: ActivityDownloadRun): string {
  const parts = [
    run.status === 'ok' || run.status === '' ? '' : run.status,
    `${run.episodesDownloaded} downloaded`,
    run.episodesFailed > 0 ? `${run.episodesFailed} failed` : '',
    run.errorSummary,
  ];
  return parts.filter((part) => part !== '').join(' · ');
}

/** What a line is about and what changed, from its stored fields only. */
function describeLine(line: ActivityFeedLine): { readonly subject: string; readonly detail: string } {
  const ledger = line.line;
  if (line.traffic !== undefined) {
    return { subject: ACTIVITY_TRAFFIC_SUBJECT, detail: describeTraffic(line.traffic) };
  }
  if (line.run !== undefined) {
    return { subject: ACTIVITY_RUN_TRIGGER_SUBJECTS[line.run.trigger] ?? ACTIVITY_RUN_SUBJECT, detail: describeRun(line.run) };
  }
  if (ledger.kind === 'change') {
    return {
      subject: ledger.title,
      detail: describeActivityChange({ source: ledger.source, actionType: ledger.detail, beforeJson: ledger.beforeJson, afterJson: ledger.afterJson }),
    };
  }
  if (ledger.kind === 'event') {
    if (ledger.detail === ACTIVITY_BRIDGE_STARTED.eventType) {
      return { subject: ACTIVITY_BRIDGE_STARTED.subject, detail: '' };
    }
    // Layer 0 of the presentation model: the recorded message, then its area and type as stored.
    return { subject: ledger.title, detail: [ledger.domain, ledger.detail].filter((part) => part !== '').join(' · ') };
  }
  if (ledger.kind === 'phone_report') {
    // The report kind is a closed enum, so it may read as plain words; the outcome is shown as stored.
    return { subject: ACTIVITY_PHONE_REPORT_SUBJECTS[ledger.title] ?? ledger.title, detail: ledger.detail };
  }
  return { subject: ledger.title, detail: ledger.detail };
}

/** Red for a failure, amber for slow, plain otherwise. */
function lineHealth(line: ActivityFeedLine): ActivityRowHealth {
  if (line.failed) {
    return 'failed';
  }
  return line.slow ? 'slow' : 'ok';
}

/**
 * Words one feed line as a row.
 *
 * @param line The feed line.
 * @param openKey The key of the line the drawer shows, if any.
 * @returns The drawable row.
 */
export function toFeedRowModel(line: ActivityFeedLine, openKey: string | undefined): ActivityFeedRowModel {
  const key = feedLineKey(line);
  const health = lineHealth(line);
  const healthLabel = { failed: ' · failed', slow: ' · slow', ok: '' }[health];
  return {
    key,
    time: ACTIVITY_FEED_TIME_FORMAT.format(line.line.atMs),
    origin: line.origin,
    originLabel: `${ACTIVITY_ORIGIN_LABELS[line.origin]}${healthLabel}`,
    health,
    ...describeLine(line),
    isOpen: key === openKey,
    line,
  };
}

/** `Today · Thu, Oct 22`, `Yesterday · Wed, Oct 21`, or the date alone. */
function dayLabel(dayStartMs: number, nowMs: number): string {
  const today = new Date(nowMs);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const yesterdayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).getTime();
  const date = ACTIVITY_FEED_DAY_FORMAT.format(dayStartMs);
  if (dayStartMs === todayStart) {
    return `Today · ${date}`;
  }
  return dayStartMs === yesterdayStart ? `Yesterday · ${date}` : date;
}

/**
 * Words the loaded days as drawable day groups.
 *
 * @param days The loaded days, newest first.
 * @param openKey The key of the line the drawer shows, if any.
 * @param nowMs The current time, which decides Today and Yesterday.
 * @returns The day groups.
 */
export function toFeedDayModels(days: readonly ActivityFeedDay[], openKey: string | undefined, nowMs: number): readonly ActivityFeedDayModel[] {
  return days.map((day) => ({ key: String(day.dayStartMs), label: dayLabel(day.dayStartMs, nowMs), rows: day.lines.map((line) => toFeedRowModel(line, openKey)) }));
}

/**
 * Appends older days to the days on screen. A day split across two pages
 * becomes one group, and a line already shown is skipped.
 *
 * @param shown The days on screen, newest first.
 * @param incoming The older days, newest first.
 * @returns The merged days, newest first.
 */
export function mergeFeedDays(shown: readonly ActivityFeedDay[], incoming: readonly ActivityFeedDay[]): readonly ActivityFeedDay[] {
  const merged = [...shown];
  const keys = new Set(shown.flatMap((day) => day.lines.map(feedLineKey)));
  for (const day of incoming) {
    const lines = day.lines.filter((line) => !keys.has(feedLineKey(line)));
    const last = merged.at(-1);
    if (last?.dayStartMs === day.dayStartMs) {
      merged[merged.length - 1] = { dayStartMs: last.dayStartMs, lines: [...last.lines, ...lines] };
    } else if (lines.length > 0) {
      merged.push({ dayStartMs: day.dayStartMs, lines });
    }
  }
  return merged;
}

/**
 * Merges a fresh first page read after live events into the days on screen
 * without shrinking the window (ADR-012, live variant): the fresh page
 * replaces the lines it covers, and the older loaded lines stay below it
 * with their own cursor.
 *
 * @param shown The days on screen.
 * @param shownCursor The cursor after the days on screen.
 * @param fresh The fresh first page.
 * @returns The days and cursor to show.
 */
export function mergeLivePage(
  shown: readonly ActivityFeedDay[],
  shownCursor: string,
  fresh: ActivityFeedView,
): { readonly days: readonly ActivityFeedDay[]; readonly cursor: string } {
  const freshLines = fresh.days.flatMap((day) => day.lines);
  const oldest = freshLines.at(-1);
  if (fresh.nextCursor === '' || oldest === undefined) {
    return { days: fresh.days, cursor: fresh.nextCursor };
  }
  const older = shown
    .map((day) => ({ dayStartMs: day.dayStartMs, lines: day.lines.filter((line) => line.line.atMs < oldest.line.atMs) }))
    .filter((day) => day.lines.length > 0);
  if (older.length === 0) {
    return { days: fresh.days, cursor: fresh.nextCursor };
  }
  return { days: mergeFeedDays(fresh.days, older), cursor: shownCursor };
}

/**
 * The line next to the open one, for ↑ / ↓ in the drawer. It stays on the
 * open line at either end of the loaded feed.
 *
 * @param days The loaded days, newest first.
 * @param openKey The key of the open line; undefined matches no line.
 * @param delta -1 for the newer line, 1 for the older one.
 * @returns The line to open, or undefined when the open line is gone.
 */
export function stepFeedLine(days: readonly ActivityFeedDay[], openKey: string | undefined, delta: number): ActivityFeedLine | undefined {
  const lines = days.flatMap((day) => day.lines);
  const index = lines.findIndex((line) => feedLineKey(line) === openKey);
  if (index === -1) {
    return undefined;
  }
  return lines[Math.min(lines.length - 1, Math.max(0, index + delta))];
}
