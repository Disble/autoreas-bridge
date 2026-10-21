import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activityread } from '../../../../../wailsjs/go/models';

/** A complete Go RecorderEntry payload, the shape Wails hands over. */
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

/** A Go HistoryView payload, nil slices included. */
function goHistoryPayload(overrides: Record<string, unknown> = {}): activityread.HistoryView {
  return activityread.HistoryView.createFrom({
    Calendar: [{ DayStartMS: 100, Total: 12, HasData: true, HasIncident: true }],
    Days: [{ DayStartMS: 100, Lines: [goLedgerLine({ PhoneAtMS: 4, Marks: ['arrived_late', 'recovered', 'incident'] })] }],
    NextCursor: 'next',
    ...overrides,
  });
}

/** Attaches fake generated bindings under `window.go.desktop.App`. */
function attachBindings(app: Record<string, unknown>) {
  Reflect.set(window, 'go', { desktop: { App: app } });
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

  it('maps a Go HistoryView onto the readonly camelCase contract', async () => {
    const { mapActivityHistoryView } = await import('../history-source.helpers');

    expect(mapActivityHistoryView(goHistoryPayload())).toEqual({
      calendar: [{ dayStartMs: 100, total: 12, hasData: true, hasIncident: true }],
      days: [
        {
          dayStartMs: 100,
          lines: [
            {
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
            },
          ],
        },
      ],
      nextCursor: 'next',
    });
  });

  it('turns nil slices and a nil phone time into empty values and drops unknown marks', async () => {
    const { mapActivityHistoryView } = await import('../history-source.helpers');

    const view = mapActivityHistoryView(
      goHistoryPayload({ Calendar: null, Days: [{ DayStartMS: 1, Lines: [goLedgerLine({ Marks: ['unclean_stop', 'recovered'] })] }, { DayStartMS: 2, Lines: null }] }),
    );

    expect(view.calendar).toEqual([]);
    expect(view.days[0].lines[0].phoneAtMs).toBeUndefined();
    expect(view.days[0].lines[0].marks).toEqual(['recovered']);
    expect(view.days[1].lines).toEqual([]);
    expect(mapActivityHistoryView(goHistoryPayload({ Days: [{ DayStartMS: 1, Lines: [goLedgerLine({ Marks: null })] }] })).days[0].lines[0].marks).toEqual([]);
    expect(mapActivityHistoryView(goHistoryPayload({ Days: null })).days).toEqual([]);
  });

  it('maps a recorder page and skips rows from an unknown source', async () => {
    const { mapActivityRecorderPage } = await import('../history-source.helpers');

    const page = mapActivityRecorderPage(
      activityread.RecorderPage.createFrom({
        Entries: [goRecorderRow({ ID: 'r-1', AtMS: 5 }), goRecorderRow({ Source: 'mobile', ID: 'x' }), goRecorderRow({ Source: 'event', ID: '7', AtMS: 4 })],
        NextCursor: 'older',
      }),
    );

    expect(page.nextCursor).toBe('older');
    expect(page.entries.map((entry) => `${entry.source}:${entry.id}`)).toEqual(['request:r-1', 'event:7']);
    expect(mapActivityRecorderPage(activityread.RecorderPage.createFrom({ Entries: null, NextCursor: '' })).entries).toEqual([]);
  });

  it('reads History and the recorder through their bindings with the arguments given', async () => {
    const search = vi.fn(() => Promise.resolve(goHistoryPayload()));
    const list = vi.fn(() => Promise.resolve(activityread.RecorderPage.createFrom({ Entries: [goRecorderRow({ ID: 'r-1' })], NextCursor: '' })));
    attachBindings({ SearchActivityHistory: search, ListActivityRecorder: list });
    const { createHistorySource } = await import('../history-source.helpers');
    const source = createHistorySource();

    const view = await source.searchHistory('downloads', 'c-2', 50);
    const page = await source.listRecorder('c-3', 100);

    expect(search).toHaveBeenCalledWith('downloads', 'c-2', 50);
    expect(list).toHaveBeenCalledWith('c-3', 100);
    expect(view.nextCursor).toBe('next');
    expect(page.entries[0].id).toBe('r-1');
  });

  it('rejects both reads when the bindings never attach', async () => {
    const { createHistorySource } = await import('../history-source.helpers');
    const source = createHistorySource();

    const historySettled = expect(source.searchHistory('all', '', 50)).rejects.toThrow('runtime unavailable');
    const recorderSettled = expect(source.listRecorder('', 100)).rejects.toThrow('runtime unavailable');
    await vi.advanceTimersByTimeAsync(5000);

    await historySettled;
    await recorderSettled;
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
