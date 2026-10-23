import { describeActivityChange } from '../change-words/change-words.helpers';
import type { ActivityFeedLine } from '../feed-source/feed.types';
import { toDrawerCauseGap } from './drawer-cause.helpers';
import { DRAWER_ORIGIN_LABELS, DRAWER_TASK_DOMAINS, DRAWER_WINDOW_ERROR_EVENT_TYPE } from './drawer.constants';
import type { DrawerHeaderModel, DrawerSection, DrawerSummaryInput, DrawerSummaryModel } from './drawer.types';
import { drawerFact, formatDrawerKeptUntil, formatDrawerTime, formatDrawerWhen } from './drawer-format.helpers';
import { changeSections, failureSections, runSections, trafficSections, windowErrorSections } from './drawer-presenters.helpers';

/** Title and phrase of a line, from its stored fields. */
function titleAndPhrase(feedLine: ActivityFeedLine): { readonly title: string; readonly phrase: string } {
  const { line, traffic, run } = feedLine;
  switch (line.kind) {
    case 'change':
      return { title: line.title, phrase: describeActivityChange({ source: line.source, actionType: line.detail, beforeJson: line.beforeJson, afterJson: line.afterJson }) };
    case 'traffic_hour':
      return { title: 'Phone checked in', phrase: traffic === undefined ? '' : `${traffic.requests} times${traffic.failed > 0 ? ` · ${traffic.failed} refused` : ''}` };
    case 'download_run':
      return { title: 'Download run', phrase: run === undefined ? '' : `${run.episodesDownloaded} downloaded${run.episodesFailed > 0 ? ` · ${run.episodesFailed} failed` : ''}` };
    case 'phone_report':
      return { title: 'Phone report', phrase: [line.title, line.detail].filter((part) => part !== '').join(' · ') };
    default:
      return { title: line.title, phrase: '' };
  }
}

/** The icon tile tone of a line: failed wins over slow. */
function toTone(line: ActivityFeedLine): DrawerHeaderModel['tone'] {
  if (line.failed) {
    return 'failed';
  }
  return line.slow ? 'slow' : 'neutral';
}

/**
 * The drawer header every kind shares: origin, title, the row's phrase and the full time.
 *
 * @param line The open line.
 * @returns The header model.
 */
export function toDrawerHeader(line: ActivityFeedLine): DrawerHeaderModel {
  return {
    origin: line.origin,
    originLabel: DRAWER_ORIGIN_LABELS[line.origin],
    ...titleAndPhrase(line),
    failed: line.failed,
    slow: line.slow,
    tone: toTone(line),
    when: formatDrawerWhen(line.line.atMs),
  };
}

/**
 * Layer 0 of the presentation model: the fields every event has, then every
 * recorded metadata key and value as stored.
 *
 * @param input The summary input.
 * @returns The sections.
 */
function genericSections(input: DrawerSummaryInput): readonly DrawerSection[] {
  const { line } = input.line;
  const rows = [
    ...(line.detail === '' ? [] : [drawerFact('type', 'Type', line.detail, { mono: true })]),
    ...(line.domain === '' ? [] : [drawerFact('area', 'Area', line.domain)]),
    ...(line.level === '' ? [] : [drawerFact('level', 'Level', line.level)]),
    drawerFact('at', 'At', `${formatDrawerWhen(line.atMs)}`),
  ];
  const recorded = Object.entries(input.metadata ?? {}).map(([key, value]) => drawerFact(key, key, value, { mono: true }));
  return [
    { kind: 'facts', key: 'common', title: '', rows },
    ...(recorded.length === 0 ? [] : [{ kind: 'facts' as const, key: 'recorded', title: 'Recorded fields', rows: recorded }]),
    ...failureSectionsWithoutKept(input),
    ...(input.incident === undefined ? [] : [{ kind: 'note' as const, key: 'kept', text: formatDrawerKeptUntil(input.incident.expiresAtMs) }]),
  ];
}

/** The failure sections without the expiry note, which the generic layer always places last. */
function failureSectionsWithoutKept(input: DrawerSummaryInput): readonly DrawerSection[] {
  return failureSections(input).filter((section) => section.key !== 'kept');
}

/** A failed phone report: what the phone stored, then its failure. */
function phoneReportSections(input: DrawerSummaryInput): readonly DrawerSection[] {
  const { line } = input.line;
  const rows = [
    ...(line.title === '' ? [] : [drawerFact('kind', 'Kind', line.title, { mono: true })]),
    ...(line.detail === '' ? [] : [drawerFact('outcome', 'Outcome', line.detail, { mono: true })]),
    ...(line.source === '' ? [] : [drawerFact('device', 'Device', line.source, { mono: true })]),
    ...(line.phoneAtMs === undefined ? [] : [drawerFact('phone', 'Done on the phone', formatDrawerTime(line.phoneAtMs))]),
    drawerFact('bridge', 'Reached the bridge', formatDrawerTime(line.atMs)),
  ];
  return [{ kind: 'facts', key: 'report', title: '', rows }, ...failureSections(input)];
}

/** The presenter of an event line, or undefined when its type has none. */
function eventSections(input: DrawerSummaryInput): readonly DrawerSection[] | undefined {
  const { line } = input.line;
  if (DRAWER_TASK_DOMAINS.has(line.domain) && line.correlationId !== '') {
    return [{ kind: 'run-story', key: 'story', correlationId: line.correlationId }, ...failureSections(input)];
  }
  if (line.detail === DRAWER_WINDOW_ERROR_EVENT_TYPE) {
    return windowErrorSections(input);
  }
  return undefined;
}

/** The tailored sections of a line, or undefined when its kind has no presenter. */
function presenterSections(input: DrawerSummaryInput): readonly DrawerSection[] | undefined {
  switch (input.line.line.kind) {
    case 'change':
      return changeSections(input);
    case 'traffic_hour':
      return trafficSections(input);
    case 'download_run':
      return runSections(input);
    case 'phone_report':
      return phoneReportSections(input);
    default:
      return eventSections(input);
  }
}

/**
 * Builds the summary view of one line: its presenter when its kind has one,
 * else the generic layer. What the summary could not translate is returned as
 * gaps for the technical view.
 *
 * @param input The line and the reads made for it.
 * @returns The sections and the gaps.
 */
export function toDrawerSummary(input: DrawerSummaryInput): DrawerSummaryModel {
  const tailored = presenterSections(input);
  const presenterGap = tailored === undefined ? [`No presenter for \`${input.line.line.detail || input.line.line.kind}\`. Shown with the generic layout.`] : [];
  const causeGap = input.incident === undefined ? undefined : toDrawerCauseGap(input.incident);
  return { sections: tailored ?? genericSections(input), gaps: [...presenterGap, ...(causeGap === undefined ? [] : [causeGap])] };
}
