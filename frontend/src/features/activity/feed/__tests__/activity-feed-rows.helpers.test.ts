import { describe, expect, it } from 'vitest';
import { describeActivityChange } from '../../change-words/change-words.helpers';
import type { ActivityDownloadRun } from '../../feed-source/feed.types';
import { maybeFeedLineKey, mergeFeedDays, mergeLivePage, stepFeedLine, toFeedDayModels, toFeedRowModel } from '../activity-feed-rows.helpers';
import { bridgeOffLine, readingLine, syncReading } from '../../drawer/__tests__/drawer.fixtures';
import { NOW_MS, buildDay, buildLine, buildView, dayStart } from './activity-feed.fixtures';

/** A finished run with every count zero, overridden per case. */
function buildRun(overrides: Partial<ActivityDownloadRun> = {}): ActivityDownloadRun {
  return {
    runId: 'r1',
    trigger: 'scheduled',
    status: 'ok',
    startedAtMs: NOW_MS,
    finishedAtMs: NOW_MS,
    animesChecked: 12,
    episodesFound: 0,
    episodesDownloaded: 3,
    episodesFailed: 0,
    skippedCount: 0,
    upToDateCount: 0,
    errorSummary: '',
    ...overrides,
  };
}

/** Builds a line whose only distinguishing data is its id and time. */
function lineAt(id: string, atMs: number) {
  return buildLine({}, { id, atMs });
}

describe('toFeedRowModel', () => {
  it('words a change as every Activity surface does, with its origin and health', () => {
    const line = buildLine({ failed: true, incidentId: 7 }, { beforeJson: '{"NroCapVisto":0}', afterJson: '{"NroCapVisto":1}' });

    expect(toFeedRowModel(line, 'change:1')).toMatchObject({
      key: 'change:1',
      time: '12:00',
      origin: 'phone',
      originLabel: 'Phone · failed',
      health: 'failed',
      canCopy: true,
      subject: 'Frieren',
      detail: describeActivityChange({ source: 'mobile', actionType: 'episode_adjusted', beforeJson: '{"NroCapVisto":0}', afterJson: '{"NroCapVisto":1}' }),
      isOpen: true,
    });
  });

  it('words a traffic hour from its stored totals', () => {
    const hourMs = new Date(2026, 9, 22, 9, 0).getTime();
    const line = buildLine({ type: 'traffic', traffic: { hourStartMs: hourMs, requests: 1912, failed: 2, maxDurationMs: 40 } }, { kind: 'traffic_hour', id: '9', atMs: hourMs });

    expect(toFeedRowModel(line, undefined)).toMatchObject({ subject: 'Phone checked in', detail: '2 failed', repeat: { badge: '×1,912', label: '1,912 times' }, isOpen: false });
  });

  it('gives a fine traffic hour no detail, only its repeat badge', () => {
    const line = buildLine({ type: 'traffic', slow: true, traffic: { hourStartMs: NOW_MS, requests: 1, failed: 0, maxDurationMs: 4000 } }, { kind: 'traffic_hour', id: '9' });

    expect(toFeedRowModel(line, undefined)).toMatchObject({ detail: '', repeat: undefined, health: 'slow' });
  });

  it.each([
    ['a scheduled run by what it downloaded', buildRun(), 'Scheduled download', '3 downloaded'],
    ['a failed run by its failures alone', buildRun({ trigger: '', status: 'error', episodesFailed: 1, errorSummary: 'disk full' }), 'Download', '1 failed'],
    ['a run that ended badly with no failed episode by its stored status', buildRun({ status: 'cancelled' }), 'Scheduled download', 'cancelled'],
  ])('words %s', (_case, run, subject, detail) => {
    const line = buildLine({ type: 'download', origin: 'bridge', run }, { kind: 'download_run', id: 'r1' });

    expect(toFeedRowModel(line, undefined)).toMatchObject({ subject, detail, origin: 'bridge', originLabel: 'Bridge' });
  });

  it.each([
    ['a bridge start as Bridge started', 'api', 'api.listening', 'Listening on :8080', 'Bridge started'],
    ['a clean close as Bridge closed', 'desktop', 'app.closed', 'bridge closed cleanly', 'Bridge closed'],
    ['any other event by its recorded message, its area and type left to the drawer', 'season', 'season.warn', 'Missed selected day', 'Missed selected day'],
  ])('words %s', (_case, domain, eventType, message, subject) => {
    const line = buildLine({ type: 'system', origin: 'bridge', slow: true }, { kind: 'event', domain, title: message, detail: eventType });

    expect(toFeedRowModel(line, undefined)).toMatchObject({ subject, detail: '', repeat: undefined, health: 'slow', canCopy: false, originLabel: 'Bridge · slow' });
  });

  it.each([
    ['how long Bridge was off after a clean close', { closedAtMs: NOW_MS - (9 * 60 + 12) * 60_000, lastEventAtMs: undefined }, 'off 9 h 12 min'],
    ['a run before that did not close', { closedAtMs: undefined, lastEventAtMs: NOW_MS - 3_600_000 }, 'did not close normally'],
    ['a run before any recorded close', { closedAtMs: undefined, lastEventAtMs: undefined }, 'close unknown'],
  ] as const)('words a Bridge start by %s, never as a failure', (_case, bridgeStart, detail) => {
    const line = buildLine({ type: 'system', origin: 'bridge', bridgeStart }, { kind: 'event', domain: 'api', title: 'http server listening on :8787', detail: 'api.listening', atMs: NOW_MS });

    expect(toFeedRowModel(line, undefined)).toMatchObject({ subject: 'Bridge started', detail, health: 'ok', canCopy: false });
  });

  it.each([
    ['an ongoing one by when it began', undefined, 'Tablet silent', 'since 11:00'],
    ['an ended one by how long it lasted', NOW_MS - 3_600_000 + 68 * 60_000, 'Tablet was silent', '1 h 8 min'],
  ])('words a tablet silence, %s, as a failed Bridge line', (_case, endMs, subject, detail) => {
    const silence = {
      deviceId: 'tab',
      startMs: NOW_MS - 3_600_000,
      endMs,
      lastReport: { kind: 'cycle_report', receivedAtMs: NOW_MS - 3_600_000, hourStartMs: undefined },
      nextReport: undefined,
      bridgeStartedAtMs: NOW_MS - 5 * 3_600_000,
      bridgeStoppedAtMs: undefined,
    };
    const line = buildLine({ type: 'traffic', origin: 'bridge', failed: true, silence }, { kind: 'tablet_silence', id: 'tab:1', atMs: NOW_MS });

    expect(toFeedRowModel(line, undefined)).toMatchObject({ subject, detail, health: 'failed', canCopy: true, originLabel: 'Bridge · failed', repeat: undefined });
  });

  it.each([
    ['a group of one event with no badge', 'frontend.error', 1, 'boom', undefined],
    ['a repeated event with its count badge', 'frontend.error', 3, 'boom', { badge: '×3', label: '3 times' }],
    ['repeated bridge starts with their count badge', 'api.listening', 2, 'Bridge started', { badge: '×2', label: '2 times' }],
  ])('words a System group of %s', (_case, eventType, count, subject, repeat) => {
    const system = { hourStartMs: new Date(2026, 9, 22, 10).getTime(), count, firstAtMs: new Date(2026, 9, 22, 10, 5).getTime(), lastAtMs: new Date(2026, 9, 22, 10, 50).getTime() };
    const line = buildLine({ type: 'system', origin: 'bridge', failed: true, system }, { kind: 'event', domain: 'frontend', title: 'boom', detail: eventType, atMs: system.lastAtMs });

    expect(toFeedRowModel(line, undefined)).toMatchObject({ subject, detail: '', repeat, time: '10:50', health: 'failed' });
  });

  it.each([
    ['an episode action', 'episode_action', 'Episode action'],
    ['a sync cycle', 'cycle_report', 'Sync cycle'],
    ['a screen stall', 'screen_stall', 'Screen stalled'],
    ['an unknown report kind as stored', 'battery_report', 'battery_report'],
  ])('words a failed phone report of %s in plain words with its stored outcome', (_case, kind, subject) => {
    const line = buildLine({ type: 'traffic', origin: 'phone', failed: true }, { kind: 'phone_report', title: kind, detail: 'failed' });

    expect(toFeedRowModel(line, undefined)).toMatchObject({ subject, detail: 'failed', health: 'failed' });
  });

  it.each([
    ['a sync process death as a failure', 'sync', 'process', 'died', true, 'Sync process', 'failed'],
    ['a service start as a neutral line', 'main', 'service', 'started', false, 'Main service', 'ok'],
    ['a tick alarm in plain words', 'sync', 'tick_alarm', 'armed', false, 'Sync tick alarm', 'ok'],
    ['an undefined process and subject as stored', 'helper', 'battery_saver', 'started', false, 'helper battery_saver', 'ok'],
  ])('words a runtime transition of %s, its change as stored', (_case, processName, subject, transition, failed, words, health) => {
    const report = { processName, subject, transition, reason: undefined, stage: '' };
    const line = buildLine({ type: 'traffic', origin: 'phone', failed, report }, { kind: 'phone_report', title: 'runtime_transition', detail: `${processName} ${subject} ${transition}` });

    expect(toFeedRowModel(line, undefined)).toMatchObject({ subject: words, detail: transition, health });
  });

  it.each([
    ['attempt_started', 'failed as it started'],
    ['claim_ops', 'failed while claiming changes'],
    ['http', 'failed while sending'],
    ['apply_write', 'failed while applying'],
    ['parse_response', 'failed while parse_response'],
  ])('words a failed sync cycle that stopped at %s', (stage, detail) => {
    const report = { processName: '', subject: '', transition: '', reason: undefined, stage };
    const line = buildLine({ type: 'traffic', origin: 'phone', failed: true, report }, { kind: 'phone_report', title: 'cycle_report', detail: 'failed' });

    expect(toFeedRowModel(line, undefined)).toMatchObject({ subject: 'Sync cycle', detail, health: 'failed' });
  });

  it.each([
    ['a transition without its facts', 'runtime_transition', undefined, 'runtime_transition', 'sync process died'],
    ['a cycle whose facts hold no stage', 'cycle_report', { processName: '', subject: '', transition: '', reason: undefined, stage: '' }, 'Sync cycle', 'failed'],
  ])('words %s as its kind and its stored outcome', (_case, title, report, subject, detail) => {
    const line = buildLine({ type: 'traffic', origin: 'phone', failed: true, report }, { kind: 'phone_report', title, detail: title === 'cycle_report' ? 'failed' : 'sync process died' });

    expect(toFeedRowModel(line, undefined)).toMatchObject({ subject, detail });
  });

  it.each([
    [1, '1 change waited for Bridge'],
    [3, '3 changes waited for Bridge'],
    [1912, '1,912 changes waited for Bridge'],
  ])('words a group of %i as one neutral row that is not a failure', (count, subject) => {
    const reports = Array.from({ length: count }, (_unused, reportId) => syncReading({ reportId, reading: 'bridge_off' }));

    expect(toFeedRowModel(bridgeOffLine(reports), undefined)).toMatchObject({ subject, detail: '', repeat: undefined, health: 'ok', originLabel: 'Phone', canCopy: false });
  });

  it.each([
    ['tablet_late', 'Tablet came back late'],
    ['real_failure', 'Sync failed'],
  ] as const)('words a %s report as a failed row of the reading alone, without the stored outcome', (reading, subject) => {
    expect(toFeedRowModel(readingLine(syncReading({ reading })), undefined)).toMatchObject({ subject, detail: '', health: 'failed', canCopy: true });
  });
});

describe('toFeedDayModels', () => {
  it.each([
    [0, 'Today · Thu, Oct 22'],
    [1, 'Yesterday · Wed, Oct 21'],
    [2, 'Tue, Oct 20'],
  ])('labels the day %i days back as %s', (daysAgo, label) => {
    const [day] = toFeedDayModels([buildDay(daysAgo, [buildLine()])], undefined, NOW_MS);

    expect(day.label).toBe(label);
  });
});

describe('mergeFeedDays', () => {
  it('joins a day split across pages and skips a line already shown', () => {
    const shown = [buildDay(0, [lineAt('3', NOW_MS), lineAt('2', NOW_MS - 1)])];
    const incoming = [buildDay(0, [lineAt('2', NOW_MS - 1), lineAt('1', NOW_MS - 2)]), buildDay(1, [lineAt('0', dayStart(1))])];

    const merged = mergeFeedDays(shown, incoming);

    expect(merged.map((day) => day.lines.map((line) => line.line.id))).toEqual([['3', '2', '1'], ['0']]);
  });
});

describe('mergeLivePage', () => {
  it('puts the fresh first page on top and keeps the older loaded lines and their cursor', () => {
    const shown = [buildDay(0, [lineAt('2', NOW_MS - 10), lineAt('1', NOW_MS - 20)]), buildDay(1, [lineAt('0', dayStart(1))])];
    const fresh = buildView([buildDay(0, [lineAt('3', NOW_MS), lineAt('2', NOW_MS - 10)])], 'fresh');

    const merged = mergeLivePage(shown, 'older', fresh);

    expect(merged.days.map((day) => day.lines.map((line) => line.line.id))).toEqual([['3', '2', '1'], ['0']]);
    expect(merged.cursor).toBe('older');
  });

  it('takes the fresh page whole when it is complete or every shown line is in it', () => {
    const shown = [buildDay(0, [lineAt('2', NOW_MS - 10)])];

    expect(mergeLivePage(shown, 'older', buildView([buildDay(0, [lineAt('3', NOW_MS)])])).cursor).toBe('');
    expect(mergeLivePage(shown, 'older', buildView([buildDay(0, [lineAt('3', NOW_MS), lineAt('2', NOW_MS - 10)])], 'fresh')).cursor).toBe('fresh');
  });
});

describe('stepFeedLine', () => {
  const days = [buildDay(0, [lineAt('3', NOW_MS), lineAt('2', NOW_MS - 1)]), buildDay(1, [lineAt('1', dayStart(1))])];

  it.each([
    ['the older line across a day', 'change:2', 1, '1'],
    ['the newer line', 'change:2', -1, '3'],
    ['the same line at the newest edge', 'change:3', -1, '3'],
    ['the same line at the oldest edge', 'change:1', 1, '1'],
  ])('opens %s', (_case, openKey, delta, expectedId) => {
    expect(stepFeedLine(days, openKey, delta)?.line.id).toBe(expectedId);
  });

  it('opens nothing when the open line is no longer loaded', () => {
    expect(stepFeedLine(days, 'change:9', 1)).toBeUndefined();
  });
});

describe('maybeFeedLineKey', () => {
  it('keys a line and gives no key without one', () => {
    expect(maybeFeedLineKey(lineAt('3', NOW_MS))).toBe('change:3');
    expect(maybeFeedLineKey(undefined)).toBeUndefined();
  });
});
