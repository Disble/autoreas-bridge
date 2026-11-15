import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityRecorderPayload } from '../activity.types';

/** A complete Go RecorderEntry payload, the shape Wails emits on `activity.recorder`. */
function goRecorderRow(overrides: Partial<ActivityRecorderPayload>): ActivityRecorderPayload {
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

  it('maps a Go recorder row onto the recorder contract, nil status and duration as undefined', async () => {
    const { mapActivityRecorderEntry } = await import('../activity-source.helpers');
    const request = goRecorderRow({ ID: 'req-1', AtMS: 5, Kind: 'http', Route: '/api/animes', HTTPStatus: 200, Outcome: 'ok', DurationMS: 41, DeviceName: 'Pixel', ErrorCode: 'e' });
    const event = goRecorderRow({ Source: 'event', AtMS: 6, Domain: 'download', Level: 'warn', EventType: 'download.failed', Message: 'm', CorrelationID: 'c-1' });

    expect(mapActivityRecorderEntry(request)).toEqual({
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
    expect(mapActivityRecorderEntry(event)).toEqual(
      expect.objectContaining({ source: 'event', id: '', httpStatus: undefined, durationMs: undefined, domain: 'download', level: 'warn', eventType: 'download.failed', message: 'm', correlationId: 'c-1' }),
    );
  });

  it('rejects a recorder row from an unknown source', async () => {
    const { mapActivityRecorderEntry } = await import('../activity-source.helpers');

    expect(() => mapActivityRecorderEntry(goRecorderRow({ Source: 'mobile' }))).toThrow('Unknown activity recorder source: mobile');
  });

  it('shares one source instance', async () => {
    const { createActivitySource } = await import('../activity-source.helpers');

    expect(createActivitySource()).toBe(createActivitySource());
  });
});
