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

  it('rejects pinMoment when the bindings never attach', async () => {
    const { createActivitySource } = await import('../activity-source.helpers');

    const pinSettled = expect(createActivitySource().pinMoment()).rejects.toThrow('runtime unavailable');
    await vi.advanceTimersByTimeAsync(5000);

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

  it('reads one incident and one request by id, a missing one as undefined', async () => {
    const getIncident = vi.fn().mockResolvedValue({ found: false, detail: {} });
    const getRequest = vi.fn().mockResolvedValue({ found: false, detail: {} });
    attachBindings({ GetActivityIncident: getIncident, GetActivityRequest: getRequest });
    const { createActivitySource } = await import('../activity-source.helpers');
    const source = createActivitySource();

    await expect(source.getIncident(42)).resolves.toBeUndefined();
    await expect(source.getRequest('req-9')).resolves.toBeUndefined();
    expect(getIncident).toHaveBeenCalledExactlyOnceWith(42);
    expect(getRequest).toHaveBeenCalledExactlyOnceWith('req-9');
  });

  it('reads a run story through its binding', async () => {
    const getStory = vi.fn().mockResolvedValue({ CorrelationID: 'c-1', Steps: null, Truncated: false });
    attachBindings({ GetActivityRunStory: getStory });
    const { createActivitySource } = await import('../activity-source.helpers');

    await expect(createActivitySource().getRunStory('c-1')).resolves.toEqual({ correlationId: 'c-1', steps: [], truncated: false });
    expect(getStory).toHaveBeenCalledExactlyOnceWith('c-1');
  });

  it('rejects every read when the bindings never attach', async () => {
    const { createActivitySource } = await import('../activity-source.helpers');
    const source = createActivitySource();

    const settled = [source.getIncident(1), source.getRequest('r'), source.getRunStory('c')].map((read) => expect(read).rejects.toThrow('runtime unavailable'));
    await vi.advanceTimersByTimeAsync(5000);

    await Promise.all(settled);
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
