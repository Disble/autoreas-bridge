import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activityread } from '../../../../../wailsjs/go/models';
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

/** A complete Go LedgerLine payload. */
function goLedgerLine(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    Kind: 'change',
    ID: '1',
    AtMS: 10,
    PhoneAtMS: null,
    Domain: 'anime',
    Source: 'mobile',
    Level: '',
    Title: 'Date A Live IV',
    Detail: 'episode_adjusted',
    CorrelationID: 'c-1',
    BeforeJSON: '{"NroCapVisto":10}',
    AfterJSON: '{"NroCapVisto":11}',
    Marks: null,
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

  it('maps a Go ledger line onto the readonly camelCase contract', async () => {
    const { mapLedgerLine } = await import('../history-source.helpers');

    expect(mapLedgerLine(activityread.LedgerLine.createFrom(goLedgerLine({ PhoneAtMS: 4, Marks: ['arrived_late', 'recovered', 'incident'] })))).toEqual({
      kind: 'change',
      id: '1',
      atMs: 10,
      phoneAtMs: 4,
      domain: 'anime',
      source: 'mobile',
      level: '',
      title: 'Date A Live IV',
      detail: 'episode_adjusted',
      correlationId: 'c-1',
      beforeJson: '{"NroCapVisto":10}',
      afterJson: '{"NroCapVisto":11}',
      marks: ['arrived_late', 'recovered', 'incident'],
    });
  });

  it('turns a nil phone time into undefined, nil marks into empty, and drops unknown marks', async () => {
    const { mapLedgerLine } = await import('../history-source.helpers');

    const line = mapLedgerLine(activityread.LedgerLine.createFrom(goLedgerLine({ Marks: ['unclean_stop', 'recovered'] })));

    expect(line.phoneAtMs).toBeUndefined();
    expect(line.marks).toEqual(['recovered']);
    expect(mapLedgerLine(activityread.LedgerLine.createFrom(goLedgerLine({ Marks: null }))).marks).toEqual([]);
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
