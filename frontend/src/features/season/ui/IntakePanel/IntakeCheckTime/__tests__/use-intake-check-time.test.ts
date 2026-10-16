import { Time } from '@internationalized/date';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CHECK_TIME_EMPTY_MESSAGE } from '../intake-check-time.constants';
import type { CheckTimePort } from '../intake-check-time.types';
import { useIntakeCheckTime } from '../use-intake-check-time';

/**
 * Builds a fake check time port.
 * @param stored The time the fake backend reports.
 * @param saveStatus The status every save resolves with.
 * @returns The port with spy-able calls.
 */
function fakePort(stored = '21:00', saveStatus = 'ok') {
  return {
    getCheckTime: vi.fn<CheckTimePort['getCheckTime']>().mockResolvedValue(stored),
    setCheckTime: vi.fn<CheckTimePort['setCheckTime']>().mockResolvedValue(saveStatus),
  };
}

/**
 * Mounts the hook and waits for the stored time to load.
 * @param port The fake port.
 * @returns The hook handle.
 */
async function renderLoaded(port: CheckTimePort) {
  const hook = renderHook(() => useIntakeCheckTime(port));
  await waitFor(() => expect(hook.result.current.checkTime).not.toBeNull());
  return hook;
}

describe('useIntakeCheckTime', () => {
  it('loads the stored check time closed', async () => {
    const { result } = await renderLoaded(fakePort('06:15'));
    expect(result.current.checkTime).toBe('06:15');
    expect(result.current.isOpen).toBe(false);
  });

  it('stays unknown when the runtime has no time to report', async () => {
    const port = fakePort('');
    const { result } = renderHook(() => useIntakeCheckTime(port));
    await waitFor(() => expect(port.getCheckTime).toHaveBeenCalled());
    expect(result.current.checkTime).toBeNull();
  });

  it('reads from a replaced source and ignores the superseded read', async () => {
    let finishStale: (hhmm: string) => void = () => undefined;
    const stale = fakePort();
    stale.getCheckTime.mockReturnValue(new Promise((resolve) => (finishStale = resolve)));
    const fresh = fakePort('06:15');
    const { result, rerender } = renderHook(({ port }) => useIntakeCheckTime(port), { initialProps: { port: stale as CheckTimePort } });

    rerender({ port: fresh });
    await waitFor(() => expect(result.current.checkTime).toBe('06:15'));
    await act(async () => {
      finishStale('21:00');
      await Promise.resolve();
    });

    expect(result.current.checkTime).toBe('06:15');
  });

  it('opens with the saved time in the field and no stale error', async () => {
    const port = fakePort('21:00', 'settings store unavailable');
    const { result } = await renderLoaded(port);
    act(() => result.current.onOpenChange(true));
    await act(() => result.current.onSave());
    expect(result.current.errorMessage).toBe('settings store unavailable');

    act(() => result.current.onOpenChange(false));
    act(() => result.current.onDraftChange(new Time(5, 0)));
    act(() => result.current.onOpenChange(true));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.draft).toEqual(new Time(21, 0));
    expect(result.current.errorMessage).toBeUndefined();
  });

  it('saves the edited time, shows it and closes', async () => {
    const port = fakePort('21:00');
    const { result } = await renderLoaded(port);
    act(() => result.current.onOpenChange(true));
    act(() => result.current.onDraftChange(new Time(6, 15)));

    await act(() => result.current.onSave());

    expect(port.setCheckTime).toHaveBeenCalledWith('06:15');
    expect(result.current.checkTime).toBe('06:15');
    expect(result.current.isOpen).toBe(false);
    expect(result.current.isSaving).toBe(false);
  });

  it('keeps the popover open with the failure and the old time', async () => {
    const port = fakePort('21:00', 'settings store unavailable');
    const { result } = await renderLoaded(port);
    act(() => result.current.onOpenChange(true));
    act(() => result.current.onDraftChange(new Time(6, 15)));

    await act(() => result.current.onSave());

    expect(result.current.isOpen).toBe(true);
    expect(result.current.errorMessage).toBe('settings store unavailable');
    expect(result.current.checkTime).toBe('21:00');
    expect(result.current.isSaving).toBe(false);
  });

  it('refuses an incomplete field without calling the backend', async () => {
    const port = fakePort('21:00');
    const { result } = await renderLoaded(port);
    act(() => result.current.onOpenChange(true));
    act(() => result.current.onDraftChange(null));

    await act(() => result.current.onSave());

    expect(port.setCheckTime).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toBe(CHECK_TIME_EMPTY_MESSAGE);
  });

  it('reports saving while the backend call is in flight', async () => {
    const port = fakePort('21:00');
    let finish: (status: string) => void = () => undefined;
    port.setCheckTime.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = await renderLoaded(port);
    act(() => result.current.onOpenChange(true));

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.onSave();
    });
    expect(result.current.isSaving).toBe(true);

    await act(async () => {
      finish('ok');
      await pending;
    });
    expect(result.current.isSaving).toBe(false);
  });
});
