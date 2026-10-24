import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVITY_PHONE_STATUS_TICK_MS } from '../activity-feed.constants';
import type { ActivityPhoneDevice } from '../activity-feed.types';
import { useActivityPhoneStatus } from '../use-activity-phone-status';

/** The bridge binding the default reader calls; a test removes it to stand for a runtime without Wails. */
const bridge = vi.hoisted(() => ({ source: {} as { getConnectedDevices?: () => Promise<readonly ActivityPhoneDevice[]> } }));

vi.mock('../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers', () => ({
  get bridgeRuntimeSource() {
    return bridge.source;
  },
}));

/** The current time of every case, epoch milliseconds. */
const NOW_MS = Date.UTC(2026, 9, 23, 12, 0);

/** A phone that synced two minutes before NOW_MS. */
const PHONE: ActivityPhoneDevice = { connection_status: 'connected', last_seen_at_ms: NOW_MS - 2 * 60_000 };

/** Lets the pending device read settle. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useActivityPhoneStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the devices on mount, on every tick with a fresh relative time, and on window focus', async () => {
    const readDevices = vi.fn().mockResolvedValue([PHONE]);
    const { result } = renderHook(() => useActivityPhoneStatus(readDevices));
    await settle();
    expect(result.current?.label).toBe('Phone connected · last sync 2m ago');

    vi.setSystemTime(NOW_MS + 60 * 60_000);
    await act(async () => {
      vi.advanceTimersByTime(ACTIVITY_PHONE_STATUS_TICK_MS);
      await Promise.resolve();
    });
    expect(readDevices).toHaveBeenCalledTimes(2);
    expect(result.current?.label).toBe('Phone connected · last sync 1h ago');

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await settle();
    expect(readDevices).toHaveBeenCalledTimes(3);
  });

  it('keeps the last line when a read fails, and stops reading once unmounted', async () => {
    const readDevices = vi.fn().mockResolvedValueOnce([PHONE]).mockRejectedValueOnce(new Error('offline'));
    const { result, unmount } = renderHook(() => useActivityPhoneStatus(readDevices));
    await settle();
    await act(async () => {
      vi.advanceTimersByTime(ACTIVITY_PHONE_STATUS_TICK_MS);
      await Promise.resolve();
    });
    expect(result.current?.label).toBe('Phone connected · last sync 2m ago');

    unmount();
    vi.advanceTimersByTime(ACTIVITY_PHONE_STATUS_TICK_MS);
    window.dispatchEvent(new Event('focus'));
    expect(readDevices).toHaveBeenCalledTimes(2);
  });

  it('turns a recently synced phone offline on its own once its sync ages past 2 minutes, even when reads fail', async () => {
    const readDevices = vi.fn().mockResolvedValueOnce([{ connection_status: 'disconnected', last_seen_at_ms: NOW_MS - 60_000 }]).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useActivityPhoneStatus(readDevices));
    await settle();
    expect(result.current?.label).toBe('Phone connected · last sync 1m ago');

    // Fake timers move the clock with each tick: five ticks age the sync from 1:00 to 2:15.
    for (let tick = 0; tick < 5; tick += 1) {
      await act(async () => {
        vi.advanceTimersByTime(ACTIVITY_PHONE_STATUS_TICK_MS);
        await Promise.resolve();
      });
    }

    expect(result.current).toEqual({ isConnected: false, label: 'Phone offline · last sync 2m ago' });
  });

  it.each([
    ['reads the devices through the bridge binding by default', true, 'Phone connected · last sync 2m ago'],
    ['hides the line without a Wails runtime to read from', false, undefined],
  ])('%s', async (_case, hasBinding, expected) => {
    bridge.source = hasBinding ? { getConnectedDevices: () => Promise.resolve([PHONE]) } : {};
    const { result } = renderHook(() => useActivityPhoneStatus());
    await settle();

    expect(result.current?.label).toBe(expected);
  });
});
