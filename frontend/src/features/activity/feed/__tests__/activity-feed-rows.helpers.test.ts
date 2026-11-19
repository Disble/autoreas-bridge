import { describe, expect, it } from 'vitest';
import { describeActivityChange } from '../../change-words/change-words.helpers';
import type { ActivityDownloadRun } from '../../../../shared/contracts/activity-feed.types';
import { maybeFeedLineKey, mergeFeedDays, mergeLivePage, stepFeedLine, toFeedDayModels, toFeedRowModel, toShownFeedPage } from '../activity-feed-rows.helpers';
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

  it('words a download run by its trigger, its failures or its stored status', () => {
    const cases: ReadonlyArray<readonly [string, ActivityDownloadRun, string, string]> = [
      ['a scheduled run by what it downloaded', buildRun(), 'Scheduled download', '3 downloaded'],
      ['a failed run by its failures alone', buildRun({ trigger: '', status: 'error', episodesFailed: 1, errorSummary: 'disk full' }), 'Download', '1 failed'],
      ['a run that ended badly with no failed episode by its stored status', buildRun({ status: 'cancelled' }), 'Scheduled download', 'cancelled'],
    ];

    for (const [name, run, subject, detail] of cases) {
      const line = buildLine({ type: 'download', origin: 'bridge', run }, { kind: 'download_run', id: 'r1' });

      expect.soft(toFeedRowModel(line, undefined), name).toMatchObject({ subject, detail, origin: 'bridge', originLabel: 'Bridge' });
    }
  });

  it('words a bridge event as started, closed or by its recorded message', () => {
    const cases = [
      ['a bridge start as Bridge started', 'api', 'api.listening', 'Listening on :8080', 'Bridge started'],
      ['a clean close as Bridge closed', 'desktop', 'app.closed', 'bridge closed cleanly', 'Bridge closed'],
      ['any other event by its recorded message, its area and type left to the drawer', 'season', 'season.warn', 'Missed selected day', 'Missed selected day'],
    ] as const;

    for (const [name, domain, eventType, message, subject] of cases) {
      const line = buildLine({ type: 'system', origin: 'bridge', slow: true }, { kind: 'event', domain, title: message, detail: eventType });

      expect.soft(toFeedRowModel(line, undefined), name).toMatchObject({ subject, detail: '', repeat: undefined, health: 'slow', canCopy: false, originLabel: 'Bridge · slow' });
    }
  });

  it('words a Bridge start by how the previous run ended, never as a failure', () => {
    const cases = [
      ['how long Bridge was off after a clean close', { closedAtMs: NOW_MS - (9 * 60 + 12) * 60_000, lastEventAtMs: undefined }, 'off 9 h 12 min'],
      ['a run before that did not close', { closedAtMs: undefined, lastEventAtMs: NOW_MS - 3_600_000 }, 'did not close normally'],
      ['a run before any recorded close', { closedAtMs: undefined, lastEventAtMs: undefined }, 'close unknown'],
    ] as const;

    for (const [name, bridgeStart, detail] of cases) {
      const line = buildLine({ type: 'system', origin: 'bridge', bridgeStart }, { kind: 'event', domain: 'api', title: 'http server listening on :8787', detail: 'api.listening', atMs: NOW_MS });

      expect.soft(toFeedRowModel(line, undefined), name).toMatchObject({ subject: 'Bridge started', detail, health: 'ok', canCopy: false });
    }
  });

  it('words an ongoing and an ended tablet silence as a failed Bridge line', () => {
    const cases = [
      ['an ongoing one by when it began', undefined, 'Tablet silent', 'since 11:00'],
      ['an ended one by how long it lasted', NOW_MS - 3_600_000 + 68 * 60_000, 'Tablet was silent', '1 h 8 min'],
    ] as const;

    for (const [name, endMs, subject, detail] of cases) {
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

      expect.soft(toFeedRowModel(line, undefined), name).toMatchObject({ subject, detail, health: 'failed', canCopy: true, originLabel: 'Bridge · failed', repeat: undefined });
    }
  });

  it('words a System group with a count badge only when it repeats', () => {
    const cases = [
      ['a group of one event with no badge', 'frontend.error', 1, 'boom', undefined],
      ['a repeated event with its count badge', 'frontend.error', 3, 'boom', { badge: '×3', label: '3 times' }],
      ['repeated bridge starts with their count badge', 'api.listening', 2, 'Bridge started', { badge: '×2', label: '2 times' }],
    ] as const;

    for (const [name, eventType, count, subject, repeat] of cases) {
      const system = { hourStartMs: new Date(2026, 9, 22, 10).getTime(), count, firstAtMs: new Date(2026, 9, 22, 10, 5).getTime(), lastAtMs: new Date(2026, 9, 22, 10, 50).getTime() };
      const line = buildLine({ type: 'system', origin: 'bridge', failed: true, system }, { kind: 'event', domain: 'frontend', title: 'boom', detail: eventType, atMs: system.lastAtMs });

      expect.soft(toFeedRowModel(line, undefined), name).toMatchObject({ subject, detail: '', repeat, time: '10:50', health: 'failed' });
    }
  });

  it('words a failed phone report kind in plain words with its stored outcome', () => {
    const cases = [
      ['an episode action', 'episode_action', 'Episode action'],
      ['a sync cycle', 'cycle_report', 'Sync cycle'],
      ['a screen stall', 'screen_stall', 'Screen stalled'],
      ['an unknown report kind as stored', 'battery_report', 'battery_report'],
    ] as const;

    for (const [name, kind, subject] of cases) {
      const line = buildLine({ type: 'traffic', origin: 'phone', failed: true }, { kind: 'phone_report', title: kind, detail: 'failed' });

      expect.soft(toFeedRowModel(line, undefined), name).toMatchObject({ subject, detail: 'failed', health: 'failed' });
    }
  });

  it('words a runtime transition by its process and subject, its change as stored', () => {
    const cases = [
      ['a sync process death as a failure', 'sync', 'process', 'died', true, 'Sync process', 'failed'],
      ['a service start as a neutral line', 'main', 'service', 'started', false, 'Main service', 'ok'],
      ['a tick alarm in plain words', 'sync', 'tick_alarm', 'armed', false, 'Sync tick alarm', 'ok'],
      ['an undefined process and subject as stored', 'helper', 'battery_saver', 'started', false, 'helper battery_saver', 'ok'],
    ] as const;

    for (const [name, processName, subject, transition, failed, words, health] of cases) {
      const report = { processName, subject, transition, reason: undefined, stage: '' };
      const line = buildLine({ type: 'traffic', origin: 'phone', failed, report }, { kind: 'phone_report', title: 'runtime_transition', detail: `${processName} ${subject} ${transition}` });

      expect.soft(toFeedRowModel(line, undefined), name).toMatchObject({ subject: words, detail: transition, health });
    }
  });

  it('words a failed sync cycle by the stage it stopped at', () => {
    const cases = [
      ['attempt_started', 'failed as it started'],
      ['claim_ops', 'failed while claiming changes'],
      ['http', 'failed while sending'],
      ['apply_write', 'failed while applying'],
      ['parse_response', 'failed while parse_response'],
    ] as const;

    for (const [stage, detail] of cases) {
      const report = { processName: '', subject: '', transition: '', reason: undefined, stage };
      const line = buildLine({ type: 'traffic', origin: 'phone', failed: true, report }, { kind: 'phone_report', title: 'cycle_report', detail: 'failed' });

      expect.soft(toFeedRowModel(line, undefined), stage).toMatchObject({ subject: 'Sync cycle', detail, health: 'failed' });
    }
  });

  it('words a report without usable facts as its kind and its stored outcome', () => {
    const cases = [
      ['a transition without its facts', 'runtime_transition', undefined, 'runtime_transition', 'sync process died'],
      ['a cycle whose facts hold no stage', 'cycle_report', { processName: '', subject: '', transition: '', reason: undefined, stage: '' }, 'Sync cycle', 'failed'],
    ] as const;

    for (const [name, title, report, subject, detail] of cases) {
      const line = buildLine({ type: 'traffic', origin: 'phone', failed: true, report }, { kind: 'phone_report', title, detail: title === 'cycle_report' ? 'failed' : 'sync process died' });

      expect.soft(toFeedRowModel(line, undefined), name).toMatchObject({ subject, detail });
    }
  });

  it('words a bridge-off group of any size as one neutral row that is not a failure', () => {
    const cases = [
      [1, '1 change waited for Bridge'],
      [3, '3 changes waited for Bridge'],
      [1912, '1,912 changes waited for Bridge'],
    ] as const;

    for (const [count, subject] of cases) {
      const reports = Array.from({ length: count }, (_unused, reportId) => syncReading({ reportId, reading: 'bridge_off' }));

      expect.soft(toFeedRowModel(bridgeOffLine(reports), undefined), `group of ${count}`).toMatchObject({ subject, detail: '', repeat: undefined, health: 'ok', originLabel: 'Phone', canCopy: false });
    }
  });

  it('words a late or failed reading as a failed row of the reading alone, without the stored outcome', () => {
    const cases = [
      ['tablet_late', 'Tablet came back late'],
      ['real_failure', 'Sync failed'],
    ] as const;

    for (const [reading, subject] of cases) {
      expect.soft(toFeedRowModel(readingLine(syncReading({ reading })), undefined), reading).toMatchObject({ subject, detail: '', health: 'failed', canCopy: true });
    }
  });
});

describe('toFeedDayModels', () => {
  it('labels today, yesterday and an older day', () => {
    const cases = [
      [0, 'Today · Thu, Oct 22'],
      [1, 'Yesterday · Wed, Oct 21'],
      [2, 'Tue, Oct 20'],
    ] as const;

    for (const [daysAgo, label] of cases) {
      const [day] = toFeedDayModels([buildDay(daysAgo, [buildLine()])], undefined, NOW_MS);

      expect.soft(day.label, `${daysAgo} days back`).toBe(label);
    }
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
  it('keeps older lines under a partial fresh page and takes a complete or covering page whole', () => {
    const shown = [buildDay(0, [lineAt('2', NOW_MS - 10), lineAt('1', NOW_MS - 20)]), buildDay(1, [lineAt('0', dayStart(1))])];
    const fresh = buildView([buildDay(0, [lineAt('3', NOW_MS), lineAt('2', NOW_MS - 10)])], 'fresh');

    const merged = mergeLivePage(shown, 'older', fresh);

    expect.soft(merged.days.map((day) => day.lines.map((line) => line.line.id)), 'fresh page over older lines').toEqual([['3', '2', '1'], ['0']]);
    expect.soft(merged.cursor, 'older cursor kept').toBe('older');

    const one = [buildDay(0, [lineAt('2', NOW_MS - 10)])];

    expect.soft(mergeLivePage(one, 'older', buildView([buildDay(0, [lineAt('3', NOW_MS)])])).cursor, 'a complete fresh page taken whole').toBe('');
    expect.soft(mergeLivePage(one, 'older', buildView([buildDay(0, [lineAt('3', NOW_MS), lineAt('2', NOW_MS - 10)])], 'fresh')).cursor, 'a fresh page holding every shown line taken whole').toBe('fresh');
  });
});

describe('toShownFeedPage', () => {
  /** A first page with line 2 and more below it. */
  const FIRST = buildView([buildDay(0, [lineAt('2', NOW_MS - 10)])], 'c1');
  /** The window loaded past FIRST, answered at 5. */
  const LOADED = { days: [buildDay(0, [lineAt('2', NOW_MS - 10), lineAt('1', NOW_MS - 20)])], cursor: 'c2', firstPageAt: 5 };

  /**
   * The line ids and cursor shown.
   * @param shown What toShownFeedPage returned.
   * @returns The ids, newest first, and the cursor.
   */
  function idsOf(shown: ReturnType<typeof toShownFeedPage>) {
    return [shown.days.flatMap((day) => day.lines.map((line) => line.line.id)), shown.cursor];
  }

  it('shows nothing, the first page, the loaded window or a refreshed page over it', () => {
    const fresh = buildView([buildDay(0, [lineAt('3', NOW_MS), lineAt('2', NOW_MS - 10)])], 'fresh');

    expect.soft(idsOf(toShownFeedPage(undefined, 0, LOADED)), 'nothing before the first page answered').toEqual([[], '']);
    expect.soft(idsOf(toShownFeedPage(FIRST, 5, undefined)), 'the first page alone until an older page was loaded').toEqual([['2'], 'c1']);
    expect.soft(idsOf(toShownFeedPage(FIRST, 5, LOADED)), 'the loaded window over the first page it extends').toEqual([['2', '1'], 'c2']);
    expect.soft(idsOf(toShownFeedPage(fresh, 9, LOADED)), 'a refreshed first page over the loaded window without shrinking it').toEqual([['3', '2', '1'], 'c2']);
  });
});

describe('stepFeedLine', () => {
  const days = [buildDay(0, [lineAt('3', NOW_MS), lineAt('2', NOW_MS - 1)]), buildDay(1, [lineAt('1', dayStart(1))])];

  it('opens the neighbouring line, holds at each edge and opens nothing once the line left', () => {
    const cases = [
      ['the older line across a day', 'change:2', 1, '1'],
      ['the newer line', 'change:2', -1, '3'],
      ['the same line at the newest edge', 'change:3', -1, '3'],
      ['the same line at the oldest edge', 'change:1', 1, '1'],
      ['nothing when the open line is no longer loaded', 'change:9', 1, undefined],
    ] as const;

    for (const [name, openKey, delta, expectedId] of cases) {
      expect.soft(stepFeedLine(days, openKey, delta)?.line.id, name).toBe(expectedId);
    }
  });
});

describe('maybeFeedLineKey', () => {
  it('keys a line and gives no key without one', () => {
    expect(maybeFeedLineKey(lineAt('3', NOW_MS))).toBe('change:3');
    expect(maybeFeedLineKey(undefined)).toBeUndefined();
  });
});
