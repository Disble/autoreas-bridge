import type { ActivityFeedLine, ActivityPhoneReportFacts } from '../feed-source/feed.types';
import { ACTIVITY_RUNTIME_TRANSITION_KIND } from '../feed/activity-feed.constants';
import { toPhoneReportWords } from '../feed/activity-feed-rows.helpers';
import { DRAWER_CYCLE_STAGES, DRAWER_REASON_LABEL, DRAWER_STEP_NOTES } from './drawer.constants';
import type { DrawerSection, DrawerStep, DrawerSummaryInput } from './drawer.types';
import { drawerFact } from './drawer-format.helpers';
import { failureSections, phoneWhenRows } from './drawer-presenters.helpers';

/** A transition's stored fields, then its recorded reason when it has one. */
function transitionSections(report: ActivityPhoneReportFacts): readonly DrawerSection[] {
  const rows = [
    drawerFact('process', 'Process', report.processName, { mono: true }),
    drawerFact('subject', 'Subject', report.subject, { mono: true }),
    drawerFact('change', 'Change', report.transition),
  ];
  const reason = report.reason;
  return [
    { kind: 'facts', key: 'transition', title: '', rows },
    ...(reason === undefined ? [] : [{ kind: 'cause' as const, key: 'reason', title: '', cause: { sentence: undefined, recordedMessage: reason, code: reason, recordedLabel: DRAWER_REASON_LABEL } }]),
  ];
}

/** One of the four stages, by where the cycle stopped: passed before it, stopped at it, not reached after it. */
function toStep(stage: string, label: string, index: number, stoppedAt: number): DrawerStep {
  if (index < stoppedAt) {
    return { key: stage, label, tone: 'success', note: undefined };
  }
  return index === stoppedAt ? { key: stage, label, tone: 'danger', note: DRAWER_STEP_NOTES.stopped } : { key: stage, label, tone: 'default', note: DRAWER_STEP_NOTES.notReached };
}

/** The four stages in order and where the cycle stopped; a stage outside the four is shown as stored instead. */
function stageSections(stage: string): readonly DrawerSection[] {
  const stoppedAt = DRAWER_CYCLE_STAGES.findIndex((known) => known.stage === stage);
  if (stoppedAt === -1) {
    return [{ kind: 'facts', key: 'stage', title: '', rows: [drawerFact('stage', 'Stopped at', stage, { mono: true })] }];
  }
  return [{ kind: 'steps', key: 'stages', title: 'Stages', steps: DRAWER_CYCLE_STAGES.map((known, index) => toStep(known.stage, known.label, index, stoppedAt)) }];
}

/**
 * The header words of a phone report line: the row's words when it carries
 * stored facts, else its kind as stored with no phrase.
 *
 * @param feedLine The phone report line, after its reading was ruled out.
 * @returns The title and phrase.
 */
export function toDrawerReportHeader(feedLine: ActivityFeedLine): { readonly title: string; readonly phrase: string } {
  const { line, report } = feedLine;
  if (report === undefined) {
    return { title: line.title, phrase: '' };
  }
  const words = toPhoneReportWords(line.title, line.detail, report);
  return { title: words.subject, phrase: words.detail };
}

/**
 * The presenter of a phone report with stored facts (S6 P2 and P3): a runtime
 * transition's fields and reason, or a failed cycle's stages; then its failure
 * cause, when it happened and arrived, and how long it is kept.
 *
 * @param input The summary input.
 * @returns The sections; undefined for a report without facts, which keeps the generic layout.
 */
export function reportSections(input: DrawerSummaryInput): readonly DrawerSection[] | undefined {
  const { line, report } = input.line;
  if (report === undefined) {
    return undefined;
  }
  const own = line.title === ACTIVITY_RUNTIME_TRANSITION_KIND ? transitionSections(report) : stageSections(report.stage);
  const failure = failureSections(input);
  return [
    ...own,
    ...failure.filter((section) => section.key !== 'kept'),
    { kind: 'facts', key: 'when', title: 'When', rows: phoneWhenRows(line, 'On the phone') },
    ...failure.filter((section) => section.key === 'kept'),
  ];
}
