import { describe, expect, it } from 'vitest';
import type { DrawerSection, DrawerSummaryInput } from '../drawer.types';
import { toDrawerHeader, toDrawerSummary } from '../drawer-summary.helpers';
import { feedLine, incident, run } from './drawer.fixtures';

/** Noon of the mockup's day, the line time every fixture uses. */
const AT = Date.UTC(2026, 9, 22, 12, 0);

/** Builds a summary input; no incident, no metadata, read a day later. */
function input(overrides: Partial<DrawerSummaryInput>): DrawerSummaryInput {
  return { line: feedLine(), incident: undefined, story: undefined, metadata: undefined, nowMs: AT + 24 * 3_600_000, ...overrides };
}

/** The kinds of a summary's sections, in order. */
function kinds(sections: readonly DrawerSection[]): readonly string[] {
  return sections.map((section) => section.kind);
}

/** The one section of a kind. */
function sectionOf<K extends DrawerSection['kind']>(sections: readonly DrawerSection[], kind: K): Extract<DrawerSection, { kind: K }> {
  const found = sections.find((section) => section.kind === kind);
  if (found === undefined) {
    throw new Error(`no ${kind} section`);
  }
  return found as Extract<DrawerSection, { kind: K }>;
}

/** A phone episode change from 1 to 2. */
const CHANGE = feedLine(
  { type: 'change', origin: 'phone' },
  { kind: 'change', source: 'mobile', title: 'Hotaru no Yomeiri', detail: 'episode_adjusted', beforeJson: '{"NroCapVisto":1}', afterJson: '{"NroCapVisto":2}', phoneAtMs: AT - 391 * 60_000, marks: ['arrived_late'] },
);

describe('toDrawerSummary', () => {
  it('words a phone change as before → after with the late chip from the stored mark', () => {
    const { sections, gaps } = toDrawerSummary(input({ line: CHANGE }));

    expect(sectionOf(sections, 'before-after')).toMatchObject({ title: 'Episode', before: '1', after: '2' });
    const rows = sectionOf(sections, 'facts').rows;
    expect(rows.map((row) => row.label)).toEqual(['Done on the phone', 'Reached the bridge']);
    expect(rows[1]?.warnChip).toBe('6 h 31 min late');
    expect(gaps).toEqual([]);
  });

  it('shows no late chip when Go did not mark the change late', () => {
    const line = feedLine({ type: 'change', origin: 'phone' }, { ...CHANGE.line, marks: [] });

    expect(sectionOf(toDrawerSummary(input({ line })).sections, 'facts').rows[1]?.warnChip).toBeUndefined();
  });

  it('skips before → after when the action has no known field and keeps the saved time of an edit', () => {
    const line = feedLine({ type: 'edit' }, { kind: 'change', source: 'desktop', title: 'Bleach', detail: 'anime_restored', beforeJson: '{}', afterJson: '{}' });

    const { sections } = toDrawerSummary(input({ line }));

    expect(kinds(sections)).toEqual(['facts']);
    expect(sectionOf(sections, 'facts').rows.map((row) => row.label)).toEqual(['Saved']);
  });

  it('adds the cause and the stored expiry when a line failed and its incident was read', () => {
    const line = feedLine({ type: 'change', origin: 'phone', failed: true, incidentId: 7 }, CHANGE.line);
    const detail = incident({ cause: { known: true, errorCode: 'conflict', message: 'applied: false' } });

    const { sections } = toDrawerSummary(input({ line, incident: detail }));

    expect(sectionOf(sections, 'cause').cause.code).toBe('conflict');
    expect(sectionOf(sections, 'note').text).toBe('These details are kept until Jan 20.');
  });

  it('notes a cause code without a catalog entry', () => {
    const line = feedLine({ type: 'change', origin: 'phone', failed: true, incidentId: 7 }, CHANGE.line);

    const { gaps } = toDrawerSummary(input({ line, incident: incident({ cause: { known: true, errorCode: 'stale_version', message: 'x' } }) }));

    expect(gaps).toEqual(['No catalog entry for `stale_version`. The recorded message is shown as is.']);
  });

  it('shows a traffic hour as three figures, its hour and the totals-only note when old and fine', () => {
    const line = feedLine({ type: 'traffic', origin: 'phone', traffic: { hourStartMs: AT, requests: 39, failed: 0, maxDurationMs: 412 } }, { kind: 'traffic_hour' });

    const { sections } = toDrawerSummary(input({ line }));

    expect(sectionOf(sections, 'stats').items.map((item) => [item.label, item.value, item.failed])).toEqual([
      ['check-ins', '39', false],
      ['refused', '0', false],
      ['slowest', '412 ms', false],
    ]);
    expect(sectionOf(sections, 'note').text).toContain('Older hours keep only these totals');
  });

  it('lists the refused check-ins of a failed hour and notes a status without a code', () => {
    const line = feedLine({ type: 'traffic', origin: 'phone', failed: true, incidentId: 7, traffic: { hourStartMs: AT, requests: 39, failed: 2, maxDurationMs: 412 } }, { kind: 'traffic_hour' });
    const detail = incident({
      requests: [
        { routeTemplate: '/api/sync/reconcile', httpStatus: 401, count: 2, firstAtMs: AT, lastAtMs: AT + 60_000, latestRequestId: 'r1', kind: 'http', outcome: 'x', maxDurationMs: 38, containsTrigger: true },
        { routeTemplate: '/api/sync/reconcile', httpStatus: 200, count: 37, firstAtMs: AT, lastAtMs: AT, latestRequestId: 'r2', kind: 'http', outcome: 'x', maxDurationMs: 412, containsTrigger: false },
      ],
    });

    const { sections, gaps } = toDrawerSummary(input({ line, incident: detail }));

    expect(sectionOf(sections, 'stats').items[1]).toMatchObject({ value: '2', failed: true });
    expect(sectionOf(sections, 'list')).toMatchObject({ title: 'Refused check-ins' });
    expect(sectionOf(sections, 'list').items.map((item) => item.text)).toEqual(['/api/sync/reconcile · 401 ×2']);
    expect(gaps).toEqual(['The 401 carried no error code, only a message. It is shown as recorded.']);
  });

  it('shows a download run as its run story alone', () => {
    const run = { runId: 'run-1', trigger: 'scheduled', status: 'ok', startedAtMs: AT, finishedAtMs: AT + 1, animesChecked: 3, episodesFound: 2, episodesDownloaded: 2, episodesFailed: 0, skippedCount: 0, upToDateCount: 1, errorSummary: '' };
    const line = feedLine({ type: 'download', run }, { kind: 'download_run', correlationId: 'run-1' });

    const { sections } = toDrawerSummary(input({ line }));

    expect(sections).toEqual([{ kind: 'run-story', key: 'story', correlationId: 'run-1' }]);
  });

  it('shows a task with a correlation id as its run story', () => {
    const line = feedLine({ type: 'task' }, { kind: 'event', domain: 'schedule', detail: 'notification.forwarded', correlationId: 'c-1' });

    expect(kinds(toDrawerSummary(input({ line })).sections)).toEqual(['run-story']);
  });

  it('falls back to the generic layer with every recorded field and notes the missing presenter', () => {
    const line = feedLine({}, { kind: 'event', domain: 'storage', level: 'warn', title: 'Free space low', detail: 'storage.free_space_low' });

    const { sections, gaps } = toDrawerSummary(input({ line, metadata: { free_bytes: '412' } }));

    expect(sectionOf(sections, 'facts').rows.map((row) => [row.label, row.value])).toEqual([
      ['Type', 'storage.free_space_low'],
      ['Area', 'storage'],
      ['Level', 'warn'],
      ['At', expect.any(String)],
    ]);
    expect(sections.filter((section) => section.kind === 'facts')[1]).toMatchObject({ title: 'Recorded fields', rows: [{ label: 'free_bytes', value: '412', mono: true }] });
    expect(gaps).toEqual(['No presenter for `storage.free_space_low`. Shown with the generic layout.']);
  });

  it('words a window error from its stored kind and route', () => {
    const line = feedLine({ failed: true }, { kind: 'event', domain: 'frontend', level: 'error', detail: 'frontend.error', title: 'boom' });

    const { sections, gaps } = toDrawerSummary(input({ line, metadata: { kind: 'render', route: '/editor', message: 'TypeError' } }));

    expect(sectionOf(sections, 'cause').cause).toEqual({ sentence: 'The /editor page crashed while drawing.', recordedMessage: '', code: 'render' });
    expect(sectionOf(sections, 'code')).toMatchObject({ title: 'Message', text: 'TypeError' });
    expect(gaps).toEqual([]);
  });

  it('shows a window error without metadata through the generic layer', () => {
    const line = feedLine({ failed: true }, { kind: 'event', domain: 'frontend', level: 'error', detail: 'frontend.error', title: 'boom' });

    expect(toDrawerSummary(input({ line })).gaps).toEqual(['No presenter for `frontend.error`. Shown with the generic layout.']);
  });
});

describe('toDrawerHeader', () => {
  it.each([
    ['a change reads the anime and the change words', CHANGE, 'Hotaru no Yomeiri', 'episode 1 → 2 · from the phone'],
    [
      'a traffic hour reads its check-ins and refusals',
      feedLine({ type: 'traffic', origin: 'phone', traffic: { hourStartMs: AT, requests: 39, failed: 2, maxDurationMs: 1 } }, { kind: 'traffic_hour' }),
      'Phone checked in',
      '39 times · 2 refused',
    ],
    ['an event reads its recorded message', feedLine({}, { kind: 'event', title: 'Bridge started', detail: 'api.listening' }), 'Bridge started', ''],
  ])('%s', (_name, line, title, phrase) => {
    expect(toDrawerHeader(line)).toMatchObject({ title, phrase });
  });
});

/** The texts of every list section, in order. */
function listTexts(sections: readonly DrawerSection[]): readonly string[] {
  return sections.flatMap((section) => (section.kind === 'list' ? section.items.map((item) => item.text) : []));
}

/** Two folded requests of a slow hour: one without a recorded duration. */
const SLOW_REQUESTS = [
  { routeTemplate: '/a', httpStatus: 200, count: 1, firstAtMs: AT, lastAtMs: AT, latestRequestId: 'a', kind: 'http', outcome: 'x', maxDurationMs: undefined, containsTrigger: false },
  { routeTemplate: '/b', httpStatus: 200, count: 1, firstAtMs: AT, lastAtMs: AT, latestRequestId: 'b', kind: 'http', outcome: 'x', maxDurationMs: 900, containsTrigger: true },
];

describe('toDrawerSummary edge cases', () => {
  it.each([
    ['an unreadable snapshot reads as a dash', '{bad', '{"NroCapVisto":2}', 'episode_adjusted', '—', '2'],
    ['a state reads as its label', '{"Estado":1}', '{"Estado":2}', 'anime_state_set', expect.any(String), expect.any(String)],
    ['an object value reads as JSON and null as a dash', '{"grade":{"a":1}}', '{"grade":null}', 'season_grade_set', '{"a":1}', '—'],
  ])('%s', (_name, beforeJson, afterJson, detail, before, after) => {
    const line = feedLine({ type: 'edit' }, { kind: 'change', source: 'desktop', detail, beforeJson, afterJson });

    expect(sectionOf(toDrawerSummary(input({ line })).sections, 'before-after')).toMatchObject({ before, after });
  });

  it('shows a change without a phone time as its bridge time alone', () => {
    const line = feedLine({ type: 'change', origin: 'phone' }, { ...CHANGE.line, phoneAtMs: undefined });

    expect(sectionOf(toDrawerSummary(input({ line })).sections, 'facts').rows.map((row) => row.label)).toEqual(['Reached the bridge']);
  });

  it('lists this and every earlier occurrence of a failure', () => {
    const line = feedLine({ type: 'change', origin: 'phone', failed: true, incidentId: 7 }, CHANGE.line);
    const detail = incident({ earlier: [{ id: 3, occurredAtMs: AT - 60_000 }] });

    expect(sectionOf(toDrawerSummary(input({ line, incident: detail })).sections, 'list')).toMatchObject({ title: 'Happened 2 times', items: [{ key: '7' }, { key: '3' }] });
  });

  it.each([
    ['a slow hour lists its slowest requests first and adds no note', AT, true, ['/b · 900 ms', '/a · 0 ms']],
    ['a recent fine hour without incident adds no note', AT + 23 * 3_600_000, false, []],
  ])('%s', (_name, hourStartMs, hasIncident, texts) => {
    const traffic = { hourStartMs, requests: 4, failed: 0, maxDurationMs: 900 };
    const line = feedLine({ type: 'traffic', origin: 'phone', slow: true, incidentId: hasIncident ? 7 : undefined, traffic }, { kind: 'traffic_hour' });

    const { sections } = toDrawerSummary(input({ line, incident: hasIncident ? incident({ requests: SLOW_REQUESTS }) : undefined }));

    expect(listTexts(sections)).toEqual(texts);
    expect(sections.some((section) => section.kind === 'note')).toBe(false);
  });

  it.each(['traffic_hour', 'download_run'])('a %s line without its row shows no tailored section', (kind) => {
    expect(toDrawerSummary(input({ line: feedLine({}, { kind }) })).sections).toEqual([]);
  });

  it('shows a failed run as its run story then its failure, without stored figures or error summary', () => {
    const line = feedLine({ type: 'download', failed: true, incidentId: 7, run: run() }, { kind: 'download_run' });

    const { sections } = toDrawerSummary(input({ line, incident: incident() }));

    expect(kinds(sections)).toEqual(['run-story', 'cause', 'note']);
  });

  it('words a window error without a route, with the events around it and its expiry', () => {
    const line = feedLine({ failed: true, incidentId: 7 }, { kind: 'event', id: '1', domain: 'frontend', level: 'error', detail: 'frontend.error', title: 'stored message' });
    const detail = incident({
      events: [
        { id: 1, atMs: AT, domain: 'frontend', level: 'error', eventType: 'frontend.error', message: 'itself', correlationId: '' },
        { id: 2, atMs: AT + 10 * 60_000, domain: 'sync', level: 'error', eventType: 'x', message: 'near', correlationId: '' },
        { id: 3, atMs: AT + 50 * 60_000, domain: 'sync', level: 'info', eventType: 'x', message: 'far', correlationId: '' },
      ],
    });

    const { sections } = toDrawerSummary(input({ line, incident: detail, metadata: { kind: 'error' } }));

    expect(sectionOf(sections, 'cause').cause.sentence).toBe('The window hit a code error.');
    expect(sections.some((section) => section.key === 'where')).toBe(false);
    expect(sectionOf(sections, 'code').text).toBe('stored message');
    expect(sectionOf(sections, 'list').items).toMatchObject([{ text: 'near', failed: true }]);
    expect(sectionOf(sections, 'note').text).toContain('kept until');
  });

  it('shows a failed phone report with the generic layout, its failure, and the presenter it lacks', () => {
    const line = feedLine({ type: 'traffic', origin: 'phone', failed: true, incidentId: 7 }, { kind: 'phone_report', title: 'cycle_report', detail: 'failed', source: 'pixel', phoneAtMs: AT - 1 });

    const { sections, gaps } = toDrawerSummary(input({ line, incident: incident() }));

    expect(kinds(sections)).toEqual(['facts', 'cause', 'note']);
    expect(sectionOf(sections, 'facts').rows.map((row) => row.label)).not.toContain('Device');
    expect(gaps[0]).toBe('No presenter for `failed`. Shown with the generic layout.');
  });

  it('adds the failure of a task run', () => {
    const task = feedLine({ type: 'task', failed: true, incidentId: 7 }, { kind: 'event', domain: 'season', correlationId: 'c' });

    expect(kinds(toDrawerSummary(input({ line: task, incident: incident() })).sections)).toEqual(['run-story', 'cause', 'note']);
  });

  it('shows a generic line with nothing optional as its time, its failure and the kind it lacks a presenter for', () => {
    const generic = toDrawerSummary(input({ line: feedLine({}, { kind: 'incident' }), incident: incident() }));

    expect(sectionOf(generic.sections, 'facts').rows.map((row) => row.label)).toEqual(['At']);
    expect(kinds(generic.sections)).toEqual(['facts', 'cause', 'note']);
    expect(generic.gaps[0]).toBe('No presenter for `incident`. Shown with the generic layout.');
  });
});

describe('toDrawerHeader edge cases', () => {
  it.each([
    ['a run without failures', feedLine({ run: run({ episodesFailed: 0, episodesDownloaded: 2 }) }, { kind: 'download_run' }), 'Download run', '2 downloaded', 'neutral'],
    ['a run with failures', feedLine({ failed: true, run: run() }, { kind: 'download_run' }), 'Download run', '0 downloaded · 1 failed', 'failed'],
    ['a run line without its row', feedLine({}, { kind: 'download_run' }), 'Download run', '', 'neutral'],
    ['a traffic line without its row', feedLine({ slow: true }, { kind: 'traffic_hour' }), 'Phone checked in', '', 'slow'],
    ['a fine hour', feedLine({ traffic: { hourStartMs: AT, requests: 5, failed: 0, maxDurationMs: 1 } }, { kind: 'traffic_hour' }), 'Phone checked in', '5 times', 'neutral'],
    ['a failed phone report reads its stored title with the generic header', feedLine({ failed: true, slow: true }, { kind: 'phone_report', title: 'cycle_report', detail: 'failed' }), 'cycle_report', '', 'failed'],
  ])('%s', (_name, line, title, phrase, tone) => {
    expect(toDrawerHeader(line)).toMatchObject({ title, phrase, tone });
  });
});

describe('a run whose story was read', () => {
  /** A failed season run. */
  const LINE = feedLine({ type: 'download', failed: true, run: run() }, { kind: 'download_run', correlationId: 'run-1' });

  it.each([
    ['an empty story says no event was recorded instead of an empty timeline', [], ['note']],
    ['a story with steps keeps its timeline', [{ id: 1, atMs: AT, domain: 'download', level: 'error', eventType: 'download.failed', message: 'm', correlationId: 'run-1', durationMs: undefined, metadataJson: '' }], ['run-story']],
  ])('%s', (_name, steps, expected) => {
    const { sections } = toDrawerSummary(input({ line: LINE, story: { correlationId: 'run-1', steps, truncated: false } }));

    expect(kinds(sections)).toEqual(expected);
  });

  it('words the empty story note from the stored fact only', () => {
    const { sections } = toDrawerSummary(input({ line: LINE, story: { correlationId: 'run-1', steps: [], truncated: false } }));

    expect(sectionOf(sections, 'note').text).toBe('No events were recorded for this run.');
  });

  it('applies the same to a task run', () => {
    const task = feedLine({ type: 'task' }, { kind: 'event', domain: 'season', correlationId: 'c' });

    expect(kinds(toDrawerSummary(input({ line: task, story: { correlationId: 'c', steps: [], truncated: false } })).sections)).toEqual(['note']);
  });
});
