import { describe, expect, it } from 'vitest';
import type { ActivityBridgeStartFacts } from '../../feed-source/feed.types';
import { formatDrawerWhen } from '../drawer-format.helpers';
import type { DrawerSection, DrawerSummaryInput } from '../drawer.types';
import { toDrawerHeader, toDrawerSummary } from '../drawer-summary.helpers';
import { feedLine } from './drawer.fixtures';

/** The start every case reads: Sat, Nov 7, 08:58. */
const START = new Date(2026, 10, 7, 8, 58).getTime();

/** A start line with how the run before it ended. */
function startInput(bridgeStart: ActivityBridgeStartFacts | undefined): DrawerSummaryInput {
  const line = feedLine({ type: 'system', origin: 'bridge', bridgeStart }, { kind: 'event', domain: 'api', level: 'info', title: 'http server listening on 0.0.0.0:8787', detail: 'api.listening', atMs: START });
  return { line, incident: undefined, story: undefined, change: undefined, changeFailed: false, metadata: undefined, nowMs: START + 3_600_000 };
}

/** Each section as its key and its untitled rows, keyed, or its text. */
function shape(sections: readonly DrawerSection[]): readonly unknown[] {
  return sections.map((section) => {
    if (section.kind === 'facts') {
      return [section.key, section.title, section.rows.map((row) => [row.key, row.label, row.value])];
    }
    return [section.key, section.kind === 'text' ? section.text : section.kind];
  });
}

describe('the drawer of a Bridge start', () => {
  it.each([
    [
      'the close and how long Bridge was off',
      { closedAtMs: START - (9 * 60 + 12) * 60_000, lastEventAtMs: undefined },
      [['start', '', [['closed', 'Closed', formatDrawerWhen(START - (9 * 60 + 12) * 60_000)], ['off', 'Off for', '9 h 12 min']]]],
    ],
    [
      'the last event of a run that did not close normally',
      { closedAtMs: undefined, lastEventAtMs: START - 32 * 3_600_000 },
      [
        ['start', '', [['closed', 'Closed', 'Not recorded'], ['last', 'Last event before', formatDrawerWhen(START - 32 * 3_600_000)]]],
        ['not-closed', 'The previous run did not close normally.'],
      ],
    ],
    ['an unknown close before any close was recorded', { closedAtMs: undefined, lastEventAtMs: undefined }, [['start', '', [['closed', 'Closed', 'Unknown']]]]],
  ] as const)('shows %s above the generic layout', (_case, bridgeStart, facts) => {
    const { sections, gaps } = toDrawerSummary(startInput(bridgeStart));

    expect(shape(sections).slice(0, facts.length)).toEqual(facts);
    expect(sections[facts.length]).toMatchObject({ kind: 'facts', key: 'common' });
    expect(gaps).toEqual(['No presenter for `api.listening`. Shown with the generic layout.']);
  });

  it('adds nothing to an event that is not a start', () => {
    const { sections } = toDrawerSummary(startInput(undefined));

    expect(sections[0]).toMatchObject({ kind: 'facts', key: 'common' });
  });

  it('titles a clean close Bridge closed', () => {
    const line = feedLine({ type: 'system', origin: 'bridge' }, { kind: 'event', domain: 'desktop', level: 'info', title: 'bridge closed cleanly', detail: 'app.closed' });

    expect(toDrawerHeader(line)).toMatchObject({ title: 'Bridge closed', phrase: '' });
  });
});
