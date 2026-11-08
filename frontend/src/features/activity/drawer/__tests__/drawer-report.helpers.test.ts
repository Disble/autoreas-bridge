import { describe, expect, it } from 'vitest';
import type { ActivityPhoneReportFacts } from '../../feed-source/feed.types';
import type { DrawerSection, DrawerSummaryInput } from '../drawer.types';
import { toDrawerHeader, toDrawerSummary } from '../drawer-summary.helpers';
import { feedLine, incident } from './drawer.fixtures';

/** Noon of the mockup's day, the line time every fixture uses. */
const AT = Date.UTC(2026, 9, 22, 12, 0);

/** Builds a summary input; no incident, no metadata, read a day later. */
function input(overrides: Partial<DrawerSummaryInput>): DrawerSummaryInput {
  return { line: feedLine(), incident: undefined, story: undefined, change: undefined, changeFailed: false, metadata: undefined, nowMs: AT + 24 * 3_600_000, ...overrides };
}

/** The one section of a key. */
function sectionAt<K extends DrawerSection['kind']>(sections: readonly DrawerSection[], kind: K, key: string): Extract<DrawerSection, { kind: K }> {
  const found = sections.find((section) => section.kind === kind && section.key === key);
  if (found === undefined) {
    throw new Error(`no ${kind} ${key} section`);
  }
  return found as Extract<DrawerSection, { kind: K }>;
}

/** The facts of a runtime transition, overridden per test. */
function transitionFacts(overrides: Partial<ActivityPhoneReportFacts> = {}): ActivityPhoneReportFacts {
  return { processName: 'sync', subject: 'process', transition: 'died', reason: 'low_memory', stage: '', ...overrides };
}

/** A runtime transition line that happened on the phone 67 minutes before it reached Bridge. */
function transitionLine(facts: ActivityPhoneReportFacts, failed = true) {
  return feedLine(
    { type: 'traffic', origin: 'phone', failed, report: facts },
    { kind: 'phone_report', title: 'runtime_transition', detail: 'sync process died', atMs: AT, phoneAtMs: AT - 67 * 60_000, marks: ['arrived_late'] },
  );
}

/** A failed cycle report line that stopped at the given stage; a cycle report stores no phone time. */
function cycleLine(stage: string) {
  const report = { processName: '', subject: '', transition: '', reason: undefined, stage };
  return feedLine({ type: 'traffic', origin: 'phone', failed: true, incidentId: 7, report }, { kind: 'phone_report', title: 'cycle_report', detail: 'failed', atMs: AT, phoneAtMs: undefined });
}

describe('a runtime transition line', () => {
  it('heads with its process and subject, then its change as stored', () => {
    expect(toDrawerHeader(transitionLine(transitionFacts()))).toMatchObject({ title: 'Sync process', phrase: 'died', tone: 'failed' });
    expect(toDrawerHeader(transitionLine(transitionFacts({ processName: 'main', subject: 'service', transition: 'started' }), false))).toMatchObject({
      title: 'Main service',
      phrase: 'started',
      tone: 'neutral',
    });
  });

  it('shows its stored fields, its recorded reason and when it happened and arrived', () => {
    const { sections, gaps } = toDrawerSummary(input({ line: transitionLine(transitionFacts()) }));

    expect(sections.map((section) => [section.key, 'title' in section ? section.title : undefined])).toEqual([
      ['transition', ''],
      ['reason', ''],
      ['when', 'When'],
    ]);
    expect(sectionAt(sections, 'facts', 'transition').rows.map((row) => [row.key, row.label, row.value, row.mono])).toEqual([
      ['process', 'Process', 'sync', true],
      ['subject', 'Subject', 'process', true],
      ['change', 'Change', 'died', false],
    ]);
    expect(sectionAt(sections, 'cause', 'reason').cause).toEqual({ sentence: undefined, recordedMessage: 'low_memory', code: 'low_memory', recordedLabel: 'Recorded reason' });
    expect(sectionAt(sections, 'facts', 'when').rows.map((row) => [row.key, row.label, row.warnChip])).toEqual([
      ['phone', 'On the phone', undefined],
      ['bridge', 'Reached the bridge', '1 h 7 min late'],
    ]);
    expect(gaps).toEqual([]);
  });

  it('shows no late chip when Go did not mark the transition late', () => {
    const line = feedLine({ ...transitionLine(transitionFacts()), failed: false }, { ...transitionLine(transitionFacts()).line, marks: [] });

    expect(sectionAt(toDrawerSummary(input({ line })).sections, 'facts', 'when').rows.map((row) => row.warnChip)).toEqual([undefined, undefined]);
  });

  it('shows no reason when the transition recorded none', () => {
    const { sections } = toDrawerSummary(input({ line: transitionLine(transitionFacts({ reason: undefined })) }));

    expect(sections.map((section) => section.key)).toEqual(['transition', 'when']);
  });
});

describe('a failed sync cycle line', () => {
  it('heads with where it stopped', () => {
    expect(toDrawerHeader(cycleLine('http'))).toMatchObject({ title: 'Sync cycle', phrase: 'failed while sending', tone: 'failed' });
  });

  it.each([
    ['attempt_started', ['danger', 'default', 'default', 'default']],
    ['claim_ops', ['success', 'danger', 'default', 'default']],
    ['http', ['success', 'success', 'danger', 'default']],
    ['apply_write', ['success', 'success', 'success', 'danger']],
  ])('draws the four stages in order when it stopped at %s', (stage, tones) => {
    const { sections } = toDrawerSummary(input({ line: cycleLine(stage), incident: incident() }));

    expect(sections.map((section) => section.key)).toEqual(['stages', 'why', 'when', 'kept']);
    const steps = sectionAt(sections, 'steps', 'stages');
    expect(steps.title).toBe('Stages');
    expect(steps.steps.map((step) => step.label)).toEqual(['Attempt started', 'Claiming changes', 'Sending', 'Applying']);
    expect(steps.steps.map((step) => step.tone)).toEqual(tones);
    expect(steps.steps.map((step) => step.note)).toEqual(tones.map((tone) => ({ success: undefined, danger: 'Stopped here', default: 'Not reached' })[tone]));
  });

  it('shows a stage outside the four as stored, without the stages', () => {
    const { sections } = toDrawerSummary(input({ line: cycleLine('parse_response') }));

    expect(sections.map((section) => section.key)).toEqual(['stage', 'when']);
    const stage = sectionAt(sections, 'facts', 'stage');
    expect(stage.title).toBe('');
    expect(stage.rows.map((row) => [row.key, row.label, row.value, row.mono])).toEqual([['stage', 'Stopped at', 'parse_response', true]]);
    expect(sectionAt(sections, 'facts', 'when').rows.map((row) => row.label)).toEqual(['Reached the bridge']);
    expect(toDrawerHeader(cycleLine('parse_response')).phrase).toBe('failed while parse_response');
  });
});
