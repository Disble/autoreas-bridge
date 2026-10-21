import { formatRelativeTimeAgo } from '../../../../shared/datetime/datetime.helpers';
import { getAnimeEstadoLabel } from '../../../../shared/helpers/anime-estado.helpers';
import type { ActivityChange, ActivityHourBar, ActivityNowView, ActivityStatusKind } from '../../activity-source/activity.types';
import {
  ACTIVITY_CHANGE_ACTION_WORDS,
  ACTIVITY_CHANGE_SOURCE_WORDS,
  ACTIVITY_COUNT_FORMAT,
  ACTIVITY_HOURS_PER_DAY,
  ACTIVITY_MIN_BAR_PERCENT,
  ACTIVITY_MINUTE_MS,
  ACTIVITY_MINUTES_PER_HOUR,
  ACTIVITY_STATUS_DOT_CLASS,
} from './activity-now.constants';
import type { ActivityHourBarModel, ActivityNowModel } from './activity-now.types';

/**
 * Picks the status dot fill for the status kind Go chose.
 *
 * @param kind The status kind.
 * @returns The Tailwind background class.
 */
export function resolveActivityStatusDotClass(kind: ActivityStatusKind): string {
  return ACTIVITY_STATUS_DOT_CLASS[kind];
}

/**
 * Formats a running time as its two largest units: `26 min`, `3 h 26 min`, `1 d 2 h`.
 *
 * @param ms Elapsed milliseconds.
 * @returns The compact duration.
 */
export function formatActivityUptime(ms: number): string {
  const totalMinutes = Math.floor(ms / ACTIVITY_MINUTE_MS);
  const totalHours = Math.floor(totalMinutes / ACTIVITY_MINUTES_PER_HOUR);
  if (totalHours === 0) {
    return `${totalMinutes} min`;
  }
  const days = Math.floor(totalHours / ACTIVITY_HOURS_PER_DAY);
  if (days === 0) {
    const minutes = totalMinutes % ACTIVITY_MINUTES_PER_HOUR;
    return minutes === 0 ? `${totalHours} h` : `${totalHours} h ${minutes} min`;
  }
  const hours = totalHours % ACTIVITY_HOURS_PER_DAY;
  return hours === 0 ? `${days} d` : `${days} d ${hours} h`;
}

/**
 * Words the line under the status sentence: the last phone contact and the bridge uptime.
 *
 * @param view The resolved Now view.
 * @param readAtMs When the view was read.
 * @returns `Last contact 5m ago · up 3 h 26 min`.
 */
export function formatActivityContactLine(view: ActivityNowView, readAtMs: number): string {
  const contact =
    view.lastPhoneContactMs === undefined
      ? 'No phone contact recorded'
      : `Last contact ${formatRelativeTimeAgo(view.lastPhoneContactMs, readAtMs)}`;
  return `${contact} · up ${formatActivityUptime(view.uptimeMs)}`;
}

/** Words a request count with its noun, `1 request` / `1,912 requests`. */
function formatRequests(count: number): string {
  return `${ACTIVITY_COUNT_FORMAT.format(count)} ${count === 1 ? 'request' : 'requests'}`;
}

/** Local `HH:00` of an hour start. */
function formatHourLabel(hourStartMs: number): string {
  return `${String(new Date(hourStartMs).getHours()).padStart(2, '0')}:00`;
}

/** Hover text of one hour. */
function formatHourTitle(bar: ActivityHourBar, label: string): string {
  if (!bar.hasData) {
    return `${label} · no data`;
  }
  const failed = bar.failed > 0 ? `, ${ACTIVITY_COUNT_FORMAT.format(bar.failed)} failed` : '';
  return `${label} · ${formatRequests(bar.count)}${failed}`;
}

/** Height of one bar relative to the busiest hour; a non-empty hour keeps a visible minimum. */
function barHeightPercent(count: number, busiest: number): number {
  if (count === 0) {
    return 0;
  }
  return Math.max(ACTIVITY_MIN_BAR_PERCENT, Math.round((count / busiest) * 100));
}

/**
 * Turns the hourly rollup into drawable bars: heights relative to the busiest
 * hour, the failed share stacked on top, and hours without data as gaps.
 *
 * @param hours The last 24 hours, oldest first.
 * @returns One model per hour, same order.
 */
export function toActivityHourBarModels(hours: readonly ActivityHourBar[]): readonly ActivityHourBarModel[] {
  const busiest = Math.max(0, ...hours.map((bar) => bar.count));
  return hours.map((bar) => {
    const label = formatHourLabel(bar.hourStartMs);
    return {
      key: bar.hourStartMs,
      label,
      isGap: !bar.hasData,
      heightPercent: barHeightPercent(bar.count, busiest),
      failedPercent: Math.round(bar.failedShare * 100),
      title: formatHourTitle(bar, label),
    };
  });
}

/**
 * The text a screen reader gets for the chart image.
 *
 * @param hours The last 24 hours.
 * @returns `Last 24 hours: 1,912 requests, 12 failed. No data for 2 of 24 hours.`
 */
export function summarizeActivityHours(hours: readonly ActivityHourBar[]): string {
  const total = hours.reduce((sum, bar) => sum + bar.count, 0);
  const failed = hours.reduce((sum, bar) => sum + bar.failed, 0);
  const gaps = hours.filter((bar) => !bar.hasData).length;
  const gapSentence = gaps > 0 ? ` No data for ${gaps} of ${hours.length} hours.` : '';
  return `Last 24 hours: ${formatRequests(total)}, ${ACTIVITY_COUNT_FORMAT.format(failed)} failed.${gapSentence}`;
}

/**
 * Reads a stored snapshot. Unreadable JSON and `null` read as empty; any other
 * non-object value is boxed, so reading a field from it yields undefined.
 */
function readSnapshot(json: string): Readonly<Record<string, unknown>> {
  try {
    return Object(JSON.parse(json)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Words a before → after pair of one numeric snapshot field, or undefined when either side is missing. */
function describeFieldChange(change: ActivityChange, field: string, format: (value: number) => string): string | undefined {
  const before = readSnapshot(change.beforeJson)[field];
  const after = readSnapshot(change.afterJson)[field];
  if (typeof before !== 'number' || typeof after !== 'number') {
    return undefined;
  }
  return `${format(before)} → ${format(after)}`;
}

/** Words a season grade change; a first grade has no before snapshot and reads as the grade alone. */
function describeGradeChange(change: ActivityChange): string | undefined {
  const grades = describeFieldChange(change, 'grade', String);
  if (grades !== undefined) {
    return `grade ${grades}`;
  }
  const first = readSnapshot(change.afterJson).grade;
  return typeof first === 'number' ? `grade ${first}` : undefined;
}

/** Words what a write did. */
function describeAction(change: ActivityChange): string {
  if (change.actionType === 'episode_adjusted') {
    const episodes = describeFieldChange(change, 'NroCapVisto', String);
    if (episodes !== undefined) {
      return `episode ${episodes}`;
    }
  }
  if (change.actionType === 'anime_state_set') {
    const states = describeFieldChange(change, 'Estado', getAnimeEstadoLabel);
    if (states !== undefined) {
      return `state ${states}`;
    }
  }
  if (change.actionType === 'season_grade_set') {
    const grade = describeGradeChange(change);
    if (grade !== undefined) {
      return grade;
    }
  }
  return ACTIVITY_CHANGE_ACTION_WORDS[change.actionType] ?? change.actionType.replaceAll('_', ' ');
}

/**
 * Words one write-journal row in plain words, as the design's "Recent changes" shows it.
 *
 * @param change The write.
 * @returns `episode 10 → 11 · from the phone`.
 */
export function describeActivityChange(change: ActivityChange): string {
  const writer = ACTIVITY_CHANGE_SOURCE_WORDS[change.source] ?? `from ${change.source}`;
  return `${describeAction(change)} · ${writer}`;
}

/**
 * Whether a resolved Now view holds nothing ever recorded: no phone contact,
 * no hour with data, no change and no open incident. Only then the first-run
 * empty state replaces the content.
 *
 * @param view The resolved view.
 * @returns True when there is nothing to show.
 */
export function isActivityNowEmpty(view: ActivityNowView): boolean {
  return (
    view.lastPhoneContactMs === undefined &&
    view.hours.every((bar) => !bar.hasData) &&
    view.recentChanges.length === 0 &&
    view.needsALook.length === 0
  );
}

/**
 * Words, formats and scales a resolved Now view for the dumb components.
 *
 * @param view The resolved view.
 * @param readAtMs When it was read, the reference for "Last contact … ago".
 * @returns Everything the Now content renders.
 */
export function toActivityNowModel(view: ActivityNowView, readAtMs: number): ActivityNowModel {
  return {
    statusDotClass: resolveActivityStatusDotClass(view.status.kind),
    sentence: view.status.sentence,
    contactLine: formatActivityContactLine(view, readAtMs),
    figures: [
      { label: 'Requests today', value: ACTIVITY_COUNT_FORMAT.format(view.requestsToday) },
      { label: 'Open incidents', value: ACTIVITY_COUNT_FORMAT.format(view.openIncidents) },
      { label: 'Changes today', value: ACTIVITY_COUNT_FORMAT.format(view.changesToday) },
    ],
    bars: toActivityHourBarModels(view.hours),
    chartSummary: summarizeActivityHours(view.hours),
    needsALook: view.needsALook,
    changes: view.recentChanges.map((change) => ({ key: change.id, animeName: change.animeName, description: describeActivityChange(change) })),
    isEmpty: isActivityNowEmpty(view),
  };
}
