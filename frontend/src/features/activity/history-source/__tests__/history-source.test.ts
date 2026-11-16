import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityRecorderPayload } from '../../activity-source/activity.types';

/** A complete Go RecorderEntry payload, the shape Wails hands over. */
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

/** Attaches a fake runtime and returns the registered handlers. */
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

describe('history-source', () => {
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

  it('streams live recorder rows and skips an unknown source without throwing out of the callback', async () => {
    const off = vi.fn();
    const handlers = attachRuntime(off);
    const { createHistorySource } = await import('../history-source.helpers');
    const listener = vi.fn();

    const unsubscribe = createHistorySource().subscribeRecorder(listener);
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
    const { createHistorySource } = await import('../history-source.helpers');

    expect(createHistorySource()).toBe(createHistorySource());
  });
});
