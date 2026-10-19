import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityNowView, ActivityRecorderEntry } from '../../../activity-source/activity.types';
import type { ActivitySource } from '../../../activity-source/activity-source.types';
import { useActivityNow } from '../use-activity-now';

/** A resolved Now view with one request today. */
const VIEW: ActivityNowView = {
  status: { kind: 'in_sync', sentence: 'Phone and bridge are in sync', quietMinutes: 0, problems: 0 },
  lastPhoneContactMs: 1,
  uptimeMs: 1,
  requestsToday: 1,
  openIncidents: 0,
  changesToday: 0,
  hours: [],
  needsALook: [],
  recentChanges: [],
};

/** A live recorder row; its content does not matter to the Now tab. */
const ENTRY = { source: 'request', id: 'req-1' } as ActivityRecorderEntry;

/** A fake source whose recorder stream the test drives by hand. */
function createFakeSource(getNow: ActivitySource['getNow']) {
  const listeners = new Set<(entry: ActivityRecorderEntry) => void>();
  const source: ActivitySource = {
    getNow,
    pinMoment: vi.fn(() => Promise.resolve()),
    listIncidents: vi.fn(),
    getIncident: vi.fn(),
    getRequest: vi.fn(),
    listRecoveredRuns: vi.fn(),
    getRunStory: vi.fn(),
    subscribeRecorder: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { source, listeners, push: () => listeners.forEach((listener) => listener(ENTRY)) };
}

/** Renders the hook inside a router and exposes the current path beside it. */
function renderNow(source: ActivitySource) {
  const wrapper = ({ children }: { readonly children: ReactNode }) => <MemoryRouter initialEntries={['/activity']}>{children}</MemoryRouter>;
  return renderHook(
    () => {
      const now = useActivityNow(source);
      const location = useLocation();
      return { now, path: location.pathname };
    },
    { wrapper },
  );
}

describe('useActivityNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(50_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts loading and resolves with the view and the time it was read', async () => {
    const { source } = createFakeSource(() => Promise.resolve(VIEW));
    const { result } = renderNow(source);

    expect(result.current.now.state).toEqual({ status: 'loading' });
    expect(result.current.now.model).toBeUndefined();
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(result.current.now.state).toEqual({ status: 'ready', view: VIEW, readAtMs: 50_000 });
    expect(result.current.now.model).toMatchObject({ sentence: 'Phone and bridge are in sync', figures: [{ label: 'Requests today', value: '1' }, expect.anything(), expect.anything()] });
  });

  it('fails exclusively and recovers through retry', async () => {
    const getNow = vi.fn<ActivitySource['getNow']>().mockRejectedValueOnce(new Error('db')).mockResolvedValue(VIEW);
    const { source } = createFakeSource(getNow);
    const { result } = renderNow(source);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(result.current.now.state).toEqual({ status: 'failed' });
    act(() => result.current.now.retry());
    expect(result.current.now.state).toEqual({ status: 'loading' });
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(result.current.now.state.status).toBe('ready');
  });

  it('reads again every 15 seconds while open, and stops once unmounted', async () => {
    const getNow = vi.fn(() => Promise.resolve(VIEW));
    const { source } = createFakeSource(getNow);
    const { unmount } = renderNow(source);
    await act(() => vi.advanceTimersByTimeAsync(0));

    await act(() => vi.advanceTimersByTimeAsync(14_999));
    expect(getNow).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(getNow).toHaveBeenCalledTimes(2);

    unmount();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(getNow).toHaveBeenCalledTimes(2);
  });

  it('reads again on a live recorder row while idle', async () => {
    const getNow = vi.fn(() => Promise.resolve(VIEW));
    const fake = createFakeSource(getNow);
    renderNow(fake.source);
    await act(() => vi.advanceTimersByTimeAsync(0));

    act(() => fake.push());
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(getNow).toHaveBeenCalledTimes(2);
  });

  it('keeps one read in flight and follows a burst during it with exactly one more', async () => {
    const pending: ((view: ActivityNowView) => void)[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const getNow = vi.fn(
      () =>
        new Promise<ActivityNowView>((resolve) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          pending.push((view) => {
            inFlight -= 1;
            resolve(view);
          });
        }),
    );
    const fake = createFakeSource(getNow);
    const { result, unmount } = renderNow(fake.source);

    act(() => {
      for (let index = 0; index < 10; index += 1) {
        fake.push();
      }
    });
    expect(getNow).toHaveBeenCalledTimes(1);

    await act(async () => pending[0](VIEW));
    expect(getNow).toHaveBeenCalledTimes(2);
    expect(result.current.now.state.status).toBe('ready');

    await act(async () => pending[1]({ ...VIEW, requestsToday: 5 }));
    expect(getNow).toHaveBeenCalledTimes(2);
    expect(maxInFlight).toBe(1);
    expect(result.current.now.state).toMatchObject({ view: { requestsToday: 5 } });

    unmount();
    expect(fake.listeners.size).toBe(0);
  });

  it('does not follow a stale read once unmounted', async () => {
    let resolveFirst: (view: ActivityNowView) => void = () => undefined;
    const getNow = vi.fn(() => new Promise<ActivityNowView>((resolve) => (resolveFirst = resolve)));
    const fake = createFakeSource(getNow);
    const { unmount } = renderNow(fake.source);

    act(() => fake.push());
    unmount();
    await act(async () => resolveFirst(VIEW));

    expect(getNow).toHaveBeenCalledTimes(1);
  });

  it('keeps the view on screen while a refresh is in flight', async () => {
    let resolveSecond: (view: ActivityNowView) => void = () => undefined;
    const getNow = vi
      .fn<ActivitySource['getNow']>()
      .mockResolvedValueOnce(VIEW)
      .mockReturnValueOnce(new Promise((resolve) => (resolveSecond = resolve)));
    const { source } = createFakeSource(getNow);
    const { result } = renderNow(source);
    await act(() => vi.advanceTimersByTimeAsync(15_000));

    expect(result.current.now.state.status).toBe('ready');
    await act(async () => resolveSecond({ ...VIEW, requestsToday: 2 }));
    expect(result.current.now.state).toMatchObject({ status: 'ready', view: { requestsToday: 2 } });
  });

  it('opens pairing from the first-run action', async () => {
    const { source } = createFakeSource(() => Promise.resolve(VIEW));
    const { result } = renderNow(source);
    await act(() => vi.advanceTimersByTimeAsync(0));

    act(() => result.current.now.openPairing());

    expect(result.current.path).toBe('/pairing');
  });
});
