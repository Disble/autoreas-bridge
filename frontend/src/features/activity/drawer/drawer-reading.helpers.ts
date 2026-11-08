import type { ActivityFeedSource } from '../feed-source/feed-source.types';
import type { ActivityFeedLine, ActivitySyncEvidence, ActivitySyncReading } from '../feed-source/feed.types';
import { ACTIVITY_SYNC_READING_WORDS } from '../feed/activity-feed.constants';
import { toBridgeOffSubject } from '../feed/activity-feed-rows.helpers';
import type { ActivityRead } from '../ui/ActivityRunStory/activity-run-story.types';
import { toActivityFoundRead } from '../ui/ActivityRunStory/activity-time.helpers';
import { DRAWER_BRIDGE_OFF_MEANING_MANY, DRAWER_EVIDENCE_LABELS, DRAWER_EVIDENCE_NOT_RECORDED, DRAWER_READING_MEANINGS, DRAWER_REPORTS_TITLE } from './drawer.constants';
import type { DrawerFact, DrawerReportChoice, DrawerSection, DrawerSummaryInput } from './drawer.types';
import { drawerFact, formatDrawerSpan, formatDrawerWhen } from './drawer-format.helpers';
import { failureSections } from './drawer-presenters.helpers';
import { toTabletReportChoices } from './drawer-tablet.helpers';

/** Words one evidence time; a fact that does not exist reads as not recorded. */
function evidenceTime(ms: number | undefined): string {
  return ms === undefined ? DRAWER_EVIDENCE_NOT_RECORDED : formatDrawerWhen(ms);
}

/** Words one period by its two bounds; a period missing either bound reads as not recorded. */
function evidencePeriod(fromMs: number | undefined, untilMs: number | undefined): string {
  return fromMs === undefined || untilMs === undefined ? DRAWER_EVIDENCE_NOT_RECORDED : `${formatDrawerWhen(fromMs)} – ${formatDrawerWhen(untilMs)}`;
}

/** The grace period fact: from the first start after the failure until the tablet's first retry was due. */
function graceFact(startMs: number | undefined, untilMs: number | undefined): DrawerFact {
  return drawerFact('grace', DRAWER_EVIDENCE_LABELS.grace, evidencePeriod(startMs, untilMs));
}

/** The facts of one report, each worded once: its times and the periods its reading measured. */
interface ReportFacts {
  /** When the device failed. */
  readonly failed: DrawerFact;
  /** The device's last contact recorded by the next start. */
  readonly contact: DrawerFact;
  /** The next start, for a reading that measured no periods. */
  readonly start: DrawerFact;
  /** Bridge off: from the failure to the next start. */
  readonly off: DrawerFact;
  /** The grace period after the next start. */
  readonly grace: DrawerFact;
  /** The device's first report after the next start. */
  readonly firstReport: DrawerFact;
  /** How long after the grace period the first report came. */
  readonly overdue: DrawerFact;
  /** When Bridge received the report. */
  readonly arrived: DrawerFact;
}

/** Words every fact of one report's evidence. */
function reportFacts(evidence: ActivitySyncEvidence): ReportFacts {
  return {
    failed: drawerFact('failed', DRAWER_EVIDENCE_LABELS.failed, evidenceTime(evidence.failedAtMs)),
    contact: drawerFact('contact', DRAWER_EVIDENCE_LABELS.contact, evidenceTime(evidence.lastContactMs)),
    start: drawerFact('start', DRAWER_EVIDENCE_LABELS.start, evidenceTime(evidence.nextStartMs)),
    off: drawerFact('off', DRAWER_EVIDENCE_LABELS.off, evidencePeriod(evidence.failedAtMs, evidence.nextStartMs)),
    grace: graceFact(evidence.nextStartMs, evidence.graceUntilMs),
    firstReport: drawerFact('firstReport', DRAWER_EVIDENCE_LABELS.firstReport, evidenceTime(evidence.firstReportMs)),
    overdue: drawerFact('overdue', DRAWER_EVIDENCE_LABELS.overdue, evidence.overdueMs === undefined ? DRAWER_EVIDENCE_NOT_RECORDED : formatDrawerSpan(evidence.overdueMs)),
    arrived: drawerFact('arrived', DRAWER_EVIDENCE_LABELS.arrived, evidenceTime(evidence.arrivedAtMs)),
  };
}

/**
 * The evidence rows of one report line with a reading. A real failure measured
 * no periods, since Bridge was on, so it shows its times. The only other reading
 * a report line carries is a late tablet, because Bridge was off reports sit in
 * their group: it shows the three periods in order, then the times they rest on.
 */
function readingRows(reading: ActivitySyncReading): readonly DrawerFact[] {
  const facts = reportFacts(reading.evidence);
  if (reading.reading === 'real_failure') {
    return [facts.failed, facts.contact, facts.start, facts.arrived];
  }
  return [facts.off, facts.grace, facts.firstReport, facts.overdue, facts.contact, facts.arrived];
}

/**
 * The header of a line with a reading, which replaces the stored report kind.
 *
 * @param line The open line.
 * @returns The title and phrase; undefined for a line with no reading.
 */
export function toDrawerReadingHeader(line: ActivityFeedLine): { readonly title: string; readonly phrase: string } | undefined {
  if (line.bridgeOff !== undefined) {
    return { title: toBridgeOffSubject(line.bridgeOff.reports.length), phrase: ACTIVITY_SYNC_READING_WORDS.bridge_off };
  }
  return line.syncReading === undefined ? undefined : { title: ACTIVITY_SYNC_READING_WORDS[line.syncReading.reading], phrase: '' };
}

/**
 * The presenter of a phone report with a reading: what the reading means, its
 * evidence as labelled times, then the failure its incident recorded.
 *
 * @param input The summary input.
 * @returns The sections; undefined for a plain report, which keeps the generic layout.
 */
export function readingSections(input: DrawerSummaryInput): readonly DrawerSection[] | undefined {
  const reading = input.line.syncReading;
  if (reading === undefined) {
    return undefined;
  }
  return [
    { kind: 'text', key: 'meaning', text: DRAWER_READING_MEANINGS[reading.reading] },
    { kind: 'facts', key: 'evidence', title: '', rows: readingRows(reading) },
    ...failureSections(input),
  ];
}

/**
 * The presenter of a Bridge off group: what it means and the grace period every
 * report shares, from the group's start, then each report with its Bridge off
 * period and its own times, newest arrival first.
 *
 * @param input The summary input.
 * @returns The sections; empty for a line without its group.
 */
export function bridgeOffSections(input: DrawerSummaryInput): readonly DrawerSection[] {
  const group = input.line.bridgeOff;
  if (group === undefined) {
    return [];
  }
  const reports = group.reports.map((report) => {
    const { off, firstReport, contact, arrived } = reportFacts(report.evidence);
    return { kind: 'facts' as const, key: String(report.reportId), title: '', rows: [off, firstReport, contact, arrived] };
  });
  return [
    { kind: 'text', key: 'meaning', text: reports.length === 1 ? DRAWER_READING_MEANINGS.bridge_off : DRAWER_BRIDGE_OFF_MEANING_MANY },
    { kind: 'facts', key: 'grace', title: '', rows: [graceFact(group.bridgeStartMs, group.reports[0]?.evidence.graceUntilMs)] },
    { kind: 'reports', key: 'reports', title: DRAWER_REPORTS_TITLE, reports },
  ];
}

/** Words one report for the picker by the two times it always has. */
function toReportChoice(report: ActivitySyncReading): DrawerReportChoice {
  const { failed, arrived } = reportFacts(report.evidence);
  return { id: report.reportId, label: `${failed.label} ${failed.value} · ${arrived.label} ${arrived.value}` };
}

/**
 * The stored reports a line can show: its own, each of its group's, or each
 * hourly summary of a traffic hour.
 *
 * @param line The open line.
 * @returns The choices, in the group's order; empty for a line with no reading or summary.
 */
export function toDrawerReportChoices(line: ActivityFeedLine): readonly DrawerReportChoice[] {
  if (line.tabletSummaries.length > 0) {
    return toTabletReportChoices(line.tabletSummaries);
  }
  const reports = line.bridgeOff?.reports ?? (line.syncReading === undefined ? [] : [line.syncReading]);
  return reports.map(toReportChoice);
}

/**
 * Reads one stored report by id; gone when no report has that id.
 *
 * @param source The feed port.
 * @param id The report id.
 * @returns The ready or gone read; rejects when the read fails.
 */
export function readDrawerStoredReport(source: ActivityFeedSource, id: number): Promise<ActivityRead<string>> {
  return source.getPhoneReport(id).then(toActivityFoundRead);
}
