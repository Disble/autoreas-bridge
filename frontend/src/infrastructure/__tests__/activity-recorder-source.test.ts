import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityRecorderPayload } from '../../shared/contracts/activity-recorder.types';

/**
 * A complete Go RecorderEntry payload, the shape Wails emits on `activity.recorder`.
 * @param overrides The fields this row sets.
 * @returns The payload.
 */
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

/**
 * Attaches a fake runtime and returns the registered handlers.
 * @param off The unsubscribe the runtime hands back.
 * @returns The handlers by event name.
 */
function attachRuntime(off: () => void): Map<string, (payload: unknown) => void> {
  const handlers = new Map<string, (payload: unknown) => void>();
  Reflect.set(window, 'runtime', {
    EventsOnMultiple: (name: string, callback: (payload: unknown) => void) => {
      handlers.set(name, callback);
      return off;
    },
  });
  return handlers;
}

describe('activity-recorder-source', () => {
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
    const { mapActivityRecorderEntry } = await import('../activity-recorder-source/activity-recorder-source.helpers');
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
    const { mapActivityRecorderEntry } = await import('../activity-recorder-source/activity-recorder-source.helpers');

    expect(() => mapActivityRecorderEntry(goRecorderRow({ Source: 'mobile' }))).toThrow('Unknown activity recorder source: mobile');
  });

  it('streams live recorder rows and skips an unknown source without throwing out of the callback', async () => {
    const off = vi.fn();
    const handlers = attachRuntime(off);
    const { createActivityRecorderSource } = await import('../activity-recorder-source/activity-recorder-source.helpers');
    const listener = vi.fn();

    const unsubscribe = createActivityRecorderSource().subscribeRecorder(listener);
    await vi.advanceTimersByTimeAsync(0);
    const emit = handlers.get('activity.recorder');
    emit?.(goRecorderRow({ ID: 'r-1', HTTPStatus: 200 }));
    expect(() => emit?.(goRecorderRow({ Source: 'mobile' }))).not.toThrow();
    emit?.(goRecorderRow({ Source: 'event', Domain: 'download' }));
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, expect.objectContaining({ source: 'request', id: 'r-1', httpStatus: 200 }));
    expect(listener).toHaveBeenNthCalledWith(2, expect.objectContaining({ source: 'event', id: '', domain: 'download' }));
    expect(off).toHaveBeenCalledTimes(1);
  });

  it('shares one source instance', async () => {
    const { createActivityRecorderSource } = await import('../activity-recorder-source/activity-recorder-source.helpers');

    expect(createActivityRecorderSource()).toBe(createActivityRecorderSource());
  });
});
