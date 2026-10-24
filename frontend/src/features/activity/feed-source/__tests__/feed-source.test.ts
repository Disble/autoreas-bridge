import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activityread } from '../../../../../wailsjs/go/models';

/** A complete Go LedgerLine payload. */
function goLedgerLine(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Kind: 'download_run',
    ID: 'run-1',
    AtMS: 10,
    PhoneAtMS: null,
    Domain: 'download',
    Source: '',
    Level: '',
    Title: '',
    Detail: '',
    CorrelationID: 'run-1',
    BeforeJSON: '',
    AfterJSON: '',
    Marks: null,
    ...overrides,
  };
}

/** A complete Go FeedLine payload: a failed download run. */
function goFeedLine(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    Type: 'download',
    Origin: 'bridge',
    Failed: true,
    Slow: false,
    IncidentID: 0,
    Line: goLedgerLine(),
    Traffic: null,
    System: null,
    Run: {
      RunID: 'run-1',
      Trigger: 'scheduled',
      Status: 'error',
      StartedAtMS: 10,
      FinishedAtMS: null,
      AnimesChecked: 4,
      EpisodesFound: 3,
      EpisodesDownloaded: 2,
      EpisodesFailed: 1,
      SkippedCount: 0,
      UpToDateCount: 1,
      ErrorSummary: 'jdownloader unreachable',
    },
    ...overrides,
  };
}

/** A Go OverviewView payload. */
function goOverview(overrides: Record<string, unknown> = {}): activityread.OverviewView {
  return activityread.OverviewView.createFrom({
    Slots: [{ StartMS: 0, EndMS: 3_600_000, Count: 5, Failed: 1 }],
    Types: [{ Type: 'download', Lines: 2, Failed: 1 }],
    ...overrides,
  });
}

/** Attaches fake generated bindings under `window.go.desktop.App`. */
function attachBindings(app: Record<string, unknown>) {
  Reflect.set(window, 'go', { desktop: { App: app } });
}

describe('feed-source', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    Reflect.deleteProperty(window, 'go');
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'go');
  });

  it('maps a Go FeedView onto the readonly camelCase contract', async () => {
    const { mapActivityFeedView } = await import('../feed-source.helpers');

    const view = mapActivityFeedView(activityread.FeedView.createFrom({ Days: [{ DayStartMS: 1, Lines: [goFeedLine({ IncidentID: 7 })] }], NextCursor: 'older' }));

    expect(view).toEqual({
      days: [
        {
          dayStartMs: 1,
          lines: [
            {
              type: 'download',
              origin: 'bridge',
              failed: true,
              slow: false,
              incidentId: 7,
              line: expect.objectContaining({ kind: 'download_run', id: 'run-1', correlationId: 'run-1', marks: [] }),
              traffic: undefined,
              run: {
                runId: 'run-1',
                trigger: 'scheduled',
                status: 'error',
                startedAtMs: 10,
                finishedAtMs: undefined,
                animesChecked: 4,
                episodesFound: 3,
                episodesDownloaded: 2,
                episodesFailed: 1,
                skippedCount: 0,
                upToDateCount: 1,
                errorSummary: 'jdownloader unreachable',
              },
            },
          ],
        },
      ],
      nextCursor: 'older',
    });
  });

  it('maps a traffic hour, a zero incident id and nil slices to empty values', async () => {
    const { mapActivityFeedView } = await import('../feed-source.helpers');
    const traffic = goFeedLine({
      Type: 'traffic',
      Origin: 'phone',
      Failed: false,
      Slow: true,
      Line: goLedgerLine({ Kind: 'traffic_hour', ID: '3600000' }),
      Traffic: { HourStartMS: 3_600_000, Requests: 31, Failed: 0, MaxDurationMS: 6148 },
      Run: null,
    });

    const view = mapActivityFeedView(activityread.FeedView.createFrom({ Days: [{ DayStartMS: 1, Lines: [traffic] }, { DayStartMS: 0, Lines: null }], NextCursor: '' }));

    expect(view.days[0].lines[0]).toMatchObject({ incidentId: undefined, slow: true, run: undefined, system: undefined, traffic: { hourStartMs: 3_600_000, requests: 31, failed: 0, maxDurationMs: 6148 } });
    expect(view.days[1].lines).toEqual([]);
    expect(mapActivityFeedView(activityread.FeedView.createFrom({ Days: null, NextCursor: '' })).days).toEqual([]);
  });

  it('maps a System group', async () => {
    const { mapActivityFeedView } = await import('../feed-source.helpers');
    const system = goFeedLine({ Type: 'system', Run: null, Line: goLedgerLine({ Kind: 'event', ID: '9' }), System: { HourStartMS: 3_600_000, Count: 3, FirstAtMS: 3_660_000, LastAtMS: 3_900_000 } });

    const view = mapActivityFeedView(activityread.FeedView.createFrom({ Days: [{ DayStartMS: 0, Lines: [system] }], NextCursor: '' }));

    expect(view.days[0].lines[0]).toMatchObject({ type: 'system', run: undefined, system: { hourStartMs: 3_600_000, count: 3, firstAtMs: 3_660_000, lastAtMs: 3_900_000 } });
  });

  it('maps a finished run time', async () => {
    const { mapActivityFeedView } = await import('../feed-source.helpers');
    const run = goFeedLine();
    Reflect.set(run.Run as object, 'FinishedAtMS', 99);

    const view = mapActivityFeedView(activityread.FeedView.createFrom({ Days: [{ DayStartMS: 1, Lines: [run] }], NextCursor: '' }));

    expect(view.days[0].lines[0].run?.finishedAtMs).toBe(99);
  });

  it('maps a Go OverviewView and turns nil slices into empty arrays', async () => {
    const { mapActivityOverview } = await import('../feed-source.helpers');

    expect(mapActivityOverview(goOverview())).toEqual({
      slots: [{ startMs: 0, endMs: 3_600_000, count: 5, failed: 1 }],
      types: [{ type: 'download', lines: 2, failed: 1 }],
    });
    expect(mapActivityOverview(goOverview({ Slots: null, Types: null }))).toMatchObject({ slots: [], types: [] });
  });

  it('reads the feed and the overview through their bindings with the arguments given', async () => {
    const search = vi.fn(() => Promise.resolve(activityread.FeedView.createFrom({ Days: [], NextCursor: 'c-2' })));
    const overview = vi.fn(() => Promise.resolve(goOverview()));
    attachBindings({ SearchActivityFeed: search, GetActivityOverview: overview });
    const { createActivityFeedSource } = await import('../feed-source.helpers');
    const source = createActivityFeedSource();

    const view = await source.searchFeed({ fromMs: 1, toMs: 2, origin: 'phone', types: ['change', 'traffic'], failuresOnly: true, cursor: 'c-1', limit: 40 });
    const counts = await source.getOverview('7d', 3, 4, 'bridge', ['task'], true);

    expect(search).toHaveBeenCalledWith({ FromMS: 1, ToMS: 2, Origin: 'phone', Types: ['change', 'traffic'], FailuresOnly: true, Cursor: 'c-1', Limit: 40 });
    expect(overview).toHaveBeenCalledWith('7d', 3, 4, 'bridge', ['task'], true);
    expect(view.nextCursor).toBe('c-2');
    expect(counts.slots).toHaveLength(1);
  });

  it('reads one event by id and maps a missing one to undefined', async () => {
    const step = { ID: 9, AtMS: 5, Domain: 'frontend', Level: 'error', EventType: 'frontend.error', Message: 'window error', CorrelationID: '', DurationMS: null, MetadataJSON: '{"route":"/#/season"}' };
    const read = vi.fn((id: number) => Promise.resolve(activityread.EventDetail.createFrom(id === 9 ? { Found: true, Step: step } : { Found: false, Step: { ...step, ID: 0 } })));
    attachBindings({ GetActivityEvent: read });
    const { createActivityFeedSource } = await import('../feed-source.helpers');
    const source = createActivityFeedSource();

    const found = await source.getEvent(9);
    const missing = await source.getEvent(10);

    expect(read).toHaveBeenCalledWith(9);
    expect(found).toMatchObject({ id: 9, domain: 'frontend', eventType: 'frontend.error', durationMs: undefined, metadataJson: '{"route":"/#/season"}' });
    expect(missing).toBeUndefined();
  });

  it('reads what a change line links to by its id, and an unknown change as undefined', async () => {
    const step = { ID: 40251, AtMS: 5, Domain: 'sync', Level: 'info', EventType: 'sync.changelog', Message: 'recorded pending changelog for a', CorrelationID: 'd4c0', DurationMS: null, MetadataJSON: '' };
    const read = vi.fn((id: number) =>
      Promise.resolve(activityread.ChangeContext.createFrom(id === 872 ? { Found: true, Events: [step], Truncated: false, Requests: null } : { Found: false, Events: null, Truncated: false, Requests: null })),
    );
    attachBindings({ GetActivityChangeContext: read });
    const { createActivityFeedSource } = await import('../feed-source.helpers');
    const source = createActivityFeedSource();

    const context = await source.getChangeContext(872, 1792801492755);
    const missing = await source.getChangeContext(873, 1792801492755);

    expect(read).toHaveBeenCalledWith(872, 1792801492755);
    expect(context?.events).toMatchObject([{ id: 40251, eventType: 'sync.changelog', message: 'recorded pending changelog for a' }]);
    expect(context?.requests).toEqual([]);
    expect(missing).toBeUndefined();
  });

  it('rejects both reads when the bindings never attach', async () => {
    const { createActivityFeedSource } = await import('../feed-source.helpers');
    const source = createActivityFeedSource();

    const feedSettled = expect(source.searchFeed({ fromMs: 0, toMs: 0, origin: 'all', types: [], failuresOnly: false, cursor: '', limit: 40 })).rejects.toThrow(
      'runtime unavailable',
    );
    const overviewSettled = expect(source.getOverview('24h', 0, 0, 'all', [], false)).rejects.toThrow('runtime unavailable');
    await vi.advanceTimersByTimeAsync(5000);

    await feedSettled;
    await overviewSettled;
  });

  it('shares one source instance', async () => {
    const { createActivityFeedSource } = await import('../feed-source.helpers');

    expect(createActivityFeedSource()).toBe(createActivityFeedSource());
  });
});
