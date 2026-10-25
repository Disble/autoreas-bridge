import { describeActivityChange } from '../change-words/change-words.helpers';
import type { ActivityDownloadRun, ActivityFeedDay, ActivityFeedLine, ActivityFeedView, ActivitySystemGroup } from '../feed-source/feed.types';
import {
  ACTIVITY_BRIDGE_STARTED,
  ACTIVITY_FEED_COUNT_FORMAT,
  ACTIVITY_FEED_DAY_FORMAT,
  ACTIVITY_FEED_TIME_FORMAT,
  ACTIVITY_ORIGIN_LABELS,
  ACTIVITY_PHONE_REPORT_SUBJECTS,
  ACTIVITY_RUN_SUBJECT,
  ACTIVITY_RUN_TRIGGER_SUBJECTS,
  ACTIVITY_TRAFFIC_SUBJECT,
} from './activity-feed.constants';
import type { ActivityFeedDayModel, ActivityFeedRowModel, ActivityRowHealth, ActivityRowRepeat } from './activity-feed.types';

/**
 * The key of a feed line: `kind:id`, unique across the feed.
 *
 * @param line The feed line.
 * @returns The key.
 */
export function feedLineKey(line: ActivityFeedLine): string {
  return `${line.line.kind}:${line.line.id}`;
}

/**
 * The key of a line that may be missing, such as the line ↑ / ↓ opens.
 *
 * @param line The feed line, or undefined.
 * @returns Its key; undefined when there is no line.
 */
export function maybeFeedLineKey(line: ActivityFeedLine | undefined): string | undefined {
  return line === undefined ? undefined : feedLineKey(line);
}

/** A row's subject, its one short detail and its repeat badge. */
type LineWords = Pick<ActivityFeedRowModel, 'subject' | 'detail' | 'repeat'>;

/**
 * The `×N` badge of a line that stands for N stored records, with `N times`
 * as its tooltip; none for a single record.
 */
function toRepeat(count: number): ActivityRowRepeat | undefined {
  if (count < 2) {
    return undefined;
  }
  const amount = ACTIVITY_FEED_COUNT_FORMAT.format(count);
  return { badge: `×${amount}`, label: `${amount} times` };
}

/** `2 failed`, or empty when nothing failed. */
function formatFailed(failed: number): string {
  return failed > 0 ? `${ACTIVITY_FEED_COUNT_FORMAT.format(failed)} failed` : '';
}

/** A run's one fact: its failures, else its stored status when not ok, else what it downloaded. */
function describeRun(run: ActivityDownloadRun): string {
  if (run.episodesFailed > 0) {
    return formatFailed(run.episodesFailed);
  }
  return run.status === 'ok' || run.status === '' ? `${run.episodesDownloaded} downloaded` : run.status;
}

/** The repeat of a System group; none for a line of no group. */
function systemRepeat(group: ActivitySystemGroup | undefined): ActivityRowRepeat | undefined {
  return group === undefined ? undefined : toRepeat(group.count);
}

/**
 * What a line is about, its one short fact and how often it repeated, from
 * its stored fields only. Spans, areas, event types and stored errors are the
 * drawer's (one row rule for every type, owner-approved mockup).
 */
function describeLine(line: ActivityFeedLine): LineWords {
  const ledger = line.line;
  if (line.traffic !== undefined) {
    return { subject: ACTIVITY_TRAFFIC_SUBJECT, detail: formatFailed(line.traffic.failed), repeat: toRepeat(line.traffic.requests) };
  }
  if (line.run !== undefined) {
    return { subject: ACTIVITY_RUN_TRIGGER_SUBJECTS[line.run.trigger] ?? ACTIVITY_RUN_SUBJECT, detail: describeRun(line.run), repeat: undefined };
  }
  if (ledger.kind === 'change') {
    return {
      subject: ledger.title,
      detail: describeActivityChange({ source: ledger.source, actionType: ledger.detail, beforeJson: ledger.beforeJson, afterJson: ledger.afterJson }),
      repeat: undefined,
    };
  }
  if (ledger.kind === 'event') {
    const subject = ledger.detail === ACTIVITY_BRIDGE_STARTED.eventType ? ACTIVITY_BRIDGE_STARTED.subject : ledger.title;
    return { subject, detail: '', repeat: systemRepeat(line.system) };
  }
  if (ledger.kind === 'phone_report') {
    // The report kind is a closed enum, so it may read as plain words; the outcome is shown as stored.
    return { subject: ACTIVITY_PHONE_REPORT_SUBJECTS[ledger.title] ?? ledger.title, detail: ledger.detail, repeat: undefined };
  }
  return { subject: ledger.title, detail: ledger.detail, repeat: undefined };
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
    canCopy: health === 'failed',
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
