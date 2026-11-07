import type { ActivityFeedSource } from '../feed-source/feed-source.types';
import type { ActivityFeedLine, ActivitySyncEvidence, ActivitySyncReading } from '../feed-source/feed.types';
import { ACTIVITY_SYNC_READING_WORDS } from '../feed/activity-feed.constants';
import { toBridgeOffSubject } from '../feed/activity-feed-rows.helpers';
import type { ActivityRead } from '../ui/ActivityRunStory/activity-run-story.types';
import { toActivityFoundRead } from '../ui/ActivityRunStory/activity-time.helpers';
import { DRAWER_BRIDGE_OFF_MEANING_MANY, DRAWER_EVIDENCE_LABELS, DRAWER_EVIDENCE_NOT_RECORDED, DRAWER_READING_MEANINGS, DRAWER_REPORTS_TITLE } from './drawer.constants';
import type { DrawerFact, DrawerReportChoice, DrawerSection, DrawerSummaryInput } from './drawer.types';
import { drawerFact, formatDrawerWhen } from './drawer-format.helpers';
import { failureSections } from './drawer-presenters.helpers';

/** Words one evidence time; a fact that does not exist reads as not recorded. */
function evidenceTime(ms: number | undefined): string {
  return ms === undefined ? DRAWER_EVIDENCE_NOT_RECORDED : formatDrawerWhen(ms);
}

/** The Bridge started fact: the start the arrival is measured from, the one a group sits on. */
function startFact(ms: number | undefined): DrawerFact {
  return drawerFact('start', DRAWER_EVIDENCE_LABELS.start, evidenceTime(ms));
}

/** The times of one report that differ from report to report. */
function reportFacts(evidence: ActivitySyncEvidence): { readonly failed: DrawerFact; readonly contact: DrawerFact; readonly arrived: DrawerFact } {
  return {
    failed: drawerFact('failed', DRAWER_EVIDENCE_LABELS.failed, evidenceTime(evidence.failedAtMs)),
    contact: drawerFact('contact', DRAWER_EVIDENCE_LABELS.contact, evidenceTime(evidence.lastContactMs)),
    arrived: drawerFact('arrived', DRAWER_EVIDENCE_LABELS.arrived, evidenceTime(evidence.arrivedAtMs)),
  };
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
  const { failed, contact, arrived } = reportFacts(reading.evidence);
  return [
    { kind: 'text', key: 'meaning', text: DRAWER_READING_MEANINGS[reading.reading] },
    { kind: 'facts', key: 'evidence', title: '', rows: [failed, contact, startFact(reading.evidence.arrivalStartMs), arrived] },
    ...failureSections(input),
  ];
}

/**
 * The presenter of a Bridge off group: what it means and its start, which every
 * report shares, then each report with its own times, newest arrival first.
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
    const { failed, contact, arrived } = reportFacts(report.evidence);
    return { kind: 'facts' as const, key: String(report.reportId), title: '', rows: [failed, contact, arrived] };
  });
  return [
    { kind: 'text', key: 'meaning', text: reports.length === 1 ? DRAWER_READING_MEANINGS.bridge_off : DRAWER_BRIDGE_OFF_MEANING_MANY },
    { kind: 'facts', key: 'start', title: '', rows: [startFact(group.bridgeStartMs)] },
    { kind: 'reports', key: 'reports', title: DRAWER_REPORTS_TITLE, reports },
  ];
}

/** Words one report for the picker by the two times it always has. */
function toReportChoice(report: ActivitySyncReading): DrawerReportChoice {
  const { failed, arrived } = reportFacts(report.evidence);
  return { id: report.reportId, label: `${failed.label} ${failed.value} · ${arrived.label} ${arrived.value}` };
}

/**
 * The stored reports a line can show: its own, or each of its group's.
 *
 * @param line The open line.
 * @returns The choices, in the group's order; empty for a line with no reading.
 */
export function toDrawerReportChoices(line: ActivityFeedLine): readonly DrawerReportChoice[] {
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
