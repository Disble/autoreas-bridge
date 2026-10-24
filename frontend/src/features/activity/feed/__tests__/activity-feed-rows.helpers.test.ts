import { describe, expect, it } from 'vitest';
import { describeActivityChange } from '../../change-words/change-words.helpers';
import type { ActivityDownloadRun } from '../../feed-source/feed.types';
import { maybeFeedLineKey, mergeFeedDays, mergeLivePage, stepFeedLine, toFeedDayModels, toFeedRowModel } from '../activity-feed-rows.helpers';
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

    expect(toFeedRowModel(line, undefined)).toMatchObject({ subject: 'Phone checked in', detail: '1,912 times · 2 failed · 09:00 – 10:00', isOpen: false });
  });

  it.each([
    ['a scheduled run with its counts', buildRun(), 'Scheduled download', '3 downloaded'],
    ['a failed run with its status, failures and stored error', buildRun({ trigger: '', status: 'error', episodesFailed: 1, errorSummary: 'disk full' }), 'Download', 'error · 3 downloaded · 1 failed · disk full'],
  ])('words %s', (_case, run, subject, detail) => {
    const line = buildLine({ type: 'download', origin: 'bridge', run }, { kind: 'download_run', id: 'r1' });

    expect(toFeedRowModel(line, undefined)).toMatchObject({ subject, detail, origin: 'bridge', originLabel: 'Bridge' });
  });

  it.each([
    ['a bridge start as Bridge started', 'api', 'api.listening', 'Listening on :8080', 'Bridge started', ''],
    ['any other event by its recorded message, area and type', 'season', 'season.warn', 'Missed selected day', 'Missed selected day', 'season · season.warn'],
    ['an event with no area by its type alone', '', 'season.warn', 'Missed selected day', 'Missed selected day', 'season.warn'],
  ])('words %s', (_case, domain, eventType, message, subject, detail) => {
    const line = buildLine({ type: 'bridge', origin: 'bridge', slow: true }, { kind: 'event', domain, title: message, detail: eventType });

    expect(toFeedRowModel(line, undefined)).toMatchObject({ subject, detail, health: 'slow', canCopy: false, originLabel: 'Bridge · slow' });
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
