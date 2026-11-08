import { describe, expect, it } from 'vitest';
import type { ActivityTabletSilence } from '../../feed-source/feed.types';
import { formatDrawerWhen } from '../drawer-format.helpers';
import type { DrawerSection, DrawerSummaryInput } from '../drawer.types';
import { toDrawerHeader, toDrawerSummary } from '../drawer-summary.helpers';
import { toDrawerDataBlocks, toDrawerTechnicalTabs } from '../drawer-technical.helpers';
import { feedLine } from './drawer.fixtures';

/** The mockup's silence: last report 11:56, on Sat, Nov 7. */
const LAST = new Date(2026, 10, 7, 11, 56).getTime();
/** The mockup's silence: Bridge started 08:58, on Sat, Nov 7. */
const STARTED = new Date(2026, 10, 7, 8, 58).getTime();
/** An hour the tablet was heard in only by its hourly summary. */
const HOUR = new Date(2026, 10, 7, 9, 0).getTime();

/** A silence of the mockup, overridden per test. */
function silence(overrides: Partial<ActivityTabletSilence> = {}): ActivityTabletSilence {
  return {
    deviceId: 'tab-7f3c',
    startMs: LAST,
    endMs: LAST + 68 * 60_000,
    lastReport: { kind: 'cycle_report', receivedAtMs: LAST, hourStartMs: undefined },
    nextReport: { kind: 'runtime_transition', receivedAtMs: LAST + 68 * 60_000, hourStartMs: undefined },
    bridgeStartedAtMs: STARTED,
    bridgeStoppedAtMs: undefined,
    ...overrides,
  };
}

/** The summary input of a silence line, an hour after it began. */
function input(value: ActivityTabletSilence): DrawerSummaryInput {
  const line = feedLine({ type: 'traffic', origin: 'bridge', failed: true, silence: value }, { kind: 'tablet_silence', id: `tab-7f3c:${value.startMs}`, atMs: value.startMs + 3_600_000 });
  return { line, incident: undefined, story: undefined, change: undefined, changeFailed: false, metadata: undefined, nowMs: LAST + 2 * 3_600_000 };
}

/** Each section as its kind and its rows or text. */
function shape(sections: readonly DrawerSection[]): readonly unknown[] {
  return sections.map((section) => {
    if (section.kind === 'facts') {
      return [section.key, section.title, section.rows.map((row) => [row.key, row.label, row.value])];
    }
    return [section.key, section.kind === 'text' ? section.text : section.kind];
  });
}

/** The sentence every silence drawer states. */
const MEANING = 'Bridge was on and received no report from the tablet for 60 minutes or more.';

describe('the drawer of a tablet silence', () => {
  it('heads an ended silence with its length and an ongoing one with when it began', () => {
    expect(toDrawerHeader(input(silence()).line)).toMatchObject({ title: 'Tablet was silent', phrase: '1 h 8 min', failed: true });
    expect(toDrawerHeader(input(silence({ endMs: undefined, nextReport: undefined })).line)).toMatchObject({ title: 'Tablet silent', phrase: 'since 11:56' });
  });

  it.each([
    [
      'ended by a report: the last and next report and the start',
      silence(),
      [['last', 'Last report received at', '11:56'], ['next', 'Next report received at', '13:04'], ['started', 'Bridge started', '08:58']],
    ],
    ['ongoing: no next report', silence({ endMs: undefined, nextReport: undefined }), [['last', 'Last report received at', '11:56'], ['started', 'Bridge started', '08:58']]],
    [
      'ended because Bridge stopped first',
      silence({ endMs: LAST + 90 * 60_000, nextReport: undefined, bridgeStoppedAtMs: LAST + 90 * 60_000 }),
      [['last', 'Last report received at', '11:56'], ['started', 'Bridge started', '08:58'], ['stopped', 'Bridge stopped', '13:26']],
    ],
    [
      'with a report of another day by its date',
      silence({ lastReport: { kind: 'cycle_report', receivedAtMs: LAST - 24 * 3_600_000, hourStartMs: undefined }, startMs: STARTED }),
      [['last', 'Last report received at', formatDrawerWhen(LAST - 24 * 3_600_000)], ['next', 'Next report received at', '13:04'], ['started', 'Bridge started', '08:58']],
    ],
    [
      'heard only by the hour, by its hour',
      silence({ lastReport: { kind: 'hourly_summary', receivedAtMs: HOUR + 3_600_000, hourStartMs: HOUR }, startMs: HOUR + 3_600_000 }),
      [['last', 'Last report received at', 'in the 09:00 – 10:00 hour'], ['next', 'Next report received at', '13:04'], ['started', 'Bridge started', '08:58']],
    ],
  ] as const)('states what it means and shows the times it rests on, %s', (_case, value, rows) => {
    const { sections, gaps } = toDrawerSummary(input(value));

    expect(shape(sections)).toEqual([
      ['meaning', MEANING],
      ['when', '', rows],
    ]);
    expect(gaps).toEqual([]);
  });

  it('has only a Data tab, holding what it was read from', () => {
    const { line } = input(silence());

    expect(toDrawerTechnicalTabs(line)).toEqual(['data']);
    expect(toDrawerDataBlocks(input(silence()))).toEqual([
      {
        label: 'Read from',
        raw: JSON.stringify({
          device_id: 'tab-7f3c',
          last_report: { kind: 'cycle_report', reported_at_ms: LAST },
          next_report: { kind: 'runtime_transition', reported_at_ms: LAST + 68 * 60_000 },
          bridge_started_at_ms: STARTED,
        }),
      },
    ]);
    expect(JSON.parse(toDrawerDataBlocks(input(silence({ endMs: undefined, nextReport: undefined })))[0]?.raw ?? '{}')).not.toHaveProperty('next_report');
    const byHour = silence({ lastReport: { kind: 'hourly_summary', receivedAtMs: HOUR + 3_600_000, hourStartMs: HOUR } });
    expect(JSON.parse(toDrawerDataBlocks(input(byHour))[0]?.raw ?? '{}')).toMatchObject({ last_report: { kind: 'hourly_summary', hour_start_ms: HOUR } });
    const stopped = silence({ endMs: LAST + 90 * 60_000, nextReport: undefined, bridgeStoppedAtMs: LAST + 90 * 60_000 });
    expect(JSON.parse(toDrawerDataBlocks(input(stopped))[0]?.raw ?? '{}')).toMatchObject({ bridge_stopped_at_ms: LAST + 90 * 60_000 });
  });
});
