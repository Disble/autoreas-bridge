import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSQLiteStatus,
  subscribeToEvent,
  WAILS_BINDINGS_POLL_MS,
} from '../dashboard.bindings';

describe('dashboard.bindings', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  it('waits for Go bindings before calling GetSQLiteStatus', async () => {
    const getSQLiteStatusMock = vi.fn().mockResolvedValue('ok');

    const statusPromise = getSQLiteStatus();

    window.go = {
      main: {
        App: {
          GetSQLiteStatus: getSQLiteStatusMock,
        },
      },
    } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(statusPromise).resolves.toBe('ok');
    expect(getSQLiteStatusMock).toHaveBeenCalledTimes(1);
  });

  it('waits for runtime bindings before subscribing to events', async () => {
    const eventsOnMultipleMock = vi.fn().mockReturnValue(() => undefined);
    const callback = vi.fn();

    const stop = subscribeToEvent('observability.log', callback);

    window.runtime = {
      EventsOnMultiple: eventsOnMultipleMock,
    } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    expect(eventsOnMultipleMock).toHaveBeenCalledWith('observability.log', callback, -1);

    stop();
  });
});
