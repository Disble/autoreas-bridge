import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activityread } from '../../../../../wailsjs/go/models';

/** A Go NowView payload as Wails hands it over, nil slices and nil pointers included. */
function goNowPayload(overrides: Record<string, unknown> = {}): activityread.NowView {
  return activityread.NowView.createFrom({
    Status: { Kind: 'problems', Sentence: '2 problems need a look', QuietMinutes: 0, Problems: 2 },
    LastPhoneContactMS: 1_700_000_000_000,
    UptimeMS: 12_360_000,
    RequestsToday: 1912,
    OpenIncidents: 2,
    ChangesToday: 7,
    Hours: [{ HourStartMS: 1_699_999_200_000, Count: 40, Failed: 4, FailedShare: 0.1, HasData: true }],
    NeedsALook: [
      {
        LatestID: 9,
        Fingerprint: 'fp-1',
        Reason: 'http_5xx',
        Title: 'Sync failed for 5 requests',
        LatestAtMS: 1_699_999_900_000,
        FirstSeenAtMS: 1_699_999_000_000,
        Occurrences: 5,
        IsNew: true,
        IsError: true,
      },
    ],
    RecentChanges: [
      {
        ID: 3,
        AtMS: 1_699_999_950_000,
        Source: 'mobile',
        ActionType: 'episode_adjusted',
        AnimeID: 'a-1',
        AnimeName: 'Date A Live IV',
        CorrelationID: 'req-1',
        BeforeJSON: '{"NroCapVisto":10}',
        AfterJSON: '{"NroCapVisto":11}',
      },
    ],
    ...overrides,
  });
}

/** A complete Go RecorderEntry payload, the shape Wails emits on `activity.recorder`. */
function goRecorderRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    Source: 'request',
    ID: '',
    AtMS: 0,
    Kind: '',
    Route: '',
    HTTPStatus: null,
    Outcome: '',
    DurationMS: null,
    DeviceName: '',
    ErrorCode: '',
    Domain: '',
    Level: '',
    EventType: '',
    Message: '',
    CorrelationID: '',
    ...overrides,
  };
}

/** Attaches fake generated bindings under `window.go.desktop.App`. */
function attachBindings(app: Record<string, unknown>) {
  Reflect.set(window, 'go', { desktop: { App: app } });
}

describe('activity-source', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  it('maps a Go NowView onto the readonly camelCase contract', async () => {
    const { mapActivityNowView } = await import('../activity-source.helpers');

    expect(mapActivityNowView(goNowPayload())).toEqual({
      status: { kind: 'problems', sentence: '2 problems need a look', quietMinutes: 0, problems: 2 },
      lastPhoneContactMs: 1_700_000_000_000,
      uptimeMs: 12_360_000,
      requestsToday: 1912,
      openIncidents: 2,
      changesToday: 7,
      hours: [{ hourStartMs: 1_699_999_200_000, count: 40, failed: 4, failedShare: 0.1, hasData: true }],
      needsALook: [
        {
          latestId: 9,
          fingerprint: 'fp-1',
          reason: 'http_5xx',
          title: 'Sync failed for 5 requests',
          latestAtMs: 1_699_999_900_000,
          firstSeenAtMs: 1_699_999_000_000,
          occurrences: 5,
          isNew: true,
          isError: true,
        },
      ],
      recentChanges: [
        {
          id: 3,
          atMs: 1_699_999_950_000,
          reportedAtMs: undefined,
          source: 'mobile',
          actionType: 'episode_adjusted',
          animeId: 'a-1',
          animeName: 'Date A Live IV',
          correlationId: 'req-1',
          beforeJson: '{"NroCapVisto":10}',
          afterJson: '{"NroCapVisto":11}',
        },
      ],
    });
  });

  it('keeps the phone time of a change the phone reported', async () => {
    const { mapActivityNowView } = await import('../activity-source.helpers');
    const payload = goNowPayload();
    payload.RecentChanges[0].ReportedAtMS = 1_699_999_940_000;

    expect(mapActivityNowView(payload).recentChanges[0].reportedAtMs).toBe(1_699_999_940_000);
  });

  it('turns nil slices and a nil last contact into empty values', async () => {
    const { mapActivityNowView } = await import('../activity-source.helpers');

    const view = mapActivityNowView(
      goNowPayload({ Status: { Kind: 'in_sync', Sentence: 'ok', QuietMinutes: 0, Problems: 0 }, LastPhoneContactMS: null, Hours: null, NeedsALook: null, RecentChanges: null }),
    );

    expect(view.lastPhoneContactMs).toBeUndefined();
    expect(view.hours).toEqual([]);
    expect(view.needsALook).toEqual([]);
    expect(view.recentChanges).toEqual([]);
    expect(view.status).toEqual({ kind: 'in_sync', sentence: 'ok', quietMinutes: 0, problems: 0 });
  });

  it.each(['in_sync', 'quiet', 'problems'])('accepts the %s status kind', async (kind) => {
    const { mapActivityNowView } = await import('../activity-source.helpers');

    expect(mapActivityNowView(goNowPayload({ Status: { Kind: kind, Sentence: 's', QuietMinutes: 0, Problems: 0 } })).status.kind).toBe(kind);
  });

  it('rejects an unknown status kind instead of widening the union', async () => {
    const { mapActivityNowView } = await import('../activity-source.helpers');

    expect(() => mapActivityNowView(goNowPayload({ Status: { Kind: 'fine', Sentence: 's', QuietMinutes: 0, Problems: 0 } }))).toThrow('Unknown activity status kind: fine');
  });

  it('reads the Now view through GetActivityNow', async () => {
    const getNow = vi.fn(() => Promise.resolve(goNowPayload()));
    attachBindings({ GetActivityNow: getNow });
    const { createActivitySource } = await import('../activity-source.helpers');

    const view = await createActivitySource().getNow();

    expect(getNow).toHaveBeenCalledTimes(1);
    expect(view.requestsToday).toBe(1912);
  });

  it('rejects getNow and pinMoment when the bindings never attach', async () => {
    const { createActivitySource } = await import('../activity-source.helpers');
    const source = createActivitySource();

    const nowPromise = source.getNow();
    const pinPromise = source.pinMoment();
    const nowSettled = expect(nowPromise).rejects.toThrow('runtime unavailable');
    const pinSettled = expect(pinPromise).rejects.toThrow('runtime unavailable');
    await vi.advanceTimersByTimeAsync(5000);

    await nowSettled;
    await pinSettled;
  });

  it('pins the moment through PinActivityMoment and passes its failure on', async () => {
    const pin = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('disk full'));
    attachBindings({ PinActivityMoment: pin });
    const { createActivitySource } = await import('../activity-source.helpers');
    const source = createActivitySource();

    await expect(source.pinMoment()).resolves.toBeUndefined();
    await expect(source.pinMoment()).rejects.toThrow('disk full');
    expect(pin).toHaveBeenCalledTimes(2);
  });

  it('streams activity.recorder rows mapped onto the recorder contract', async () => {
    const handlers = new Map<string, (payload: unknown) => void>();
    const off = vi.fn();
    Reflect.set(window, 'runtime', {
      EventsOnMultiple: (name: string, callback: (payload: unknown) => void) => {
        handlers.set(name, callback);
        return off;
      },
    });
    const { createActivitySource } = await import('../activity-source.helpers');
    const listener = vi.fn();

    const unsubscribe = createActivitySource().subscribeRecorder(listener);
    await vi.advanceTimersByTimeAsync(0);
    handlers.get('activity.recorder')?.(
      goRecorderRow({ ID: 'req-1', AtMS: 5, Kind: 'http', Route: '/api/animes', HTTPStatus: 200, Outcome: 'ok', DurationMS: 41, DeviceName: 'Pixel', ErrorCode: 'e' }),
    );
    handlers.get('activity.recorder')?.(
      goRecorderRow({ Source: 'event', AtMS: 6, Domain: 'download', Level: 'warn', EventType: 'download.failed', Message: 'm', CorrelationID: 'c-1' }),
    );
    unsubscribe();

    expect(listener).toHaveBeenNthCalledWith(1, {
      source: 'request',
      id: 'req-1',
      atMs: 5,
      kind: 'http',
      route: '/api/animes',
      httpStatus: 200,
      outcome: 'ok',
      durationMs: 41,
      deviceName: 'Pixel',
      errorCode: 'e',
      domain: '',
      level: '',
      eventType: '',
      message: '',
      correlationId: '',
    });
    expect(listener).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ source: 'event', id: '', httpStatus: undefined, durationMs: undefined, domain: 'download', level: 'warn', eventType: 'download.failed', message: 'm', correlationId: 'c-1' }),
    );
    expect(off).toHaveBeenCalledTimes(1);
  });

  it('rejects a recorder row from an unknown source', async () => {
    const { mapActivityRecorderEntry } = await import('../activity-source.helpers');

    expect(() => mapActivityRecorderEntry(activityread.RecorderEntry.createFrom(goRecorderRow({ Source: 'mobile' })))).toThrow('Unknown activity recorder source: mobile');
  });

  it('shares one source instance', async () => {
    const { createActivitySource } = await import('../activity-source.helpers');

    expect(createActivitySource()).toBe(createActivitySource());
  });
});
