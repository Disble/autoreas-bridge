import { Time } from '@internationalized/date';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ModuleReadiness } from '../../../../../../shared/contracts/readiness.types';
import { createBridgeError } from '../../../../../../shared/query/bridge-error/bridge-error.helpers';
import { createModulesTestWrapper } from '../../../../../../shared/query/test-support/bridge-modules.test-support';
import { CHECK_TIME_EMPTY_MESSAGE, CHECK_TIME_SAVE_FAILED_MESSAGE } from '../intake-check-time.constants';
import type { CheckTimePort } from '../intake-check-time.types';
import { useIntakeCheckTime } from '../use-intake-check-time';

/** Toast spy a rejected save reports through. */
const toastMock = vi.hoisted(() => ({ danger: vi.fn() }));

vi.mock('@heroui/react', () => ({ toast: toastMock }));

/**
 * Builds a fake settings port for the check time.
 * @param stored The time the fake backend reports.
 * @returns The port with spy-able calls; every save resolves.
 */
function fakePort(stored = '21:00') {
  return {
    getSeasonCheckTime: vi.fn<CheckTimePort['getSeasonCheckTime']>().mockResolvedValue(stored),
    setSeasonCheckTime: vi.fn<CheckTimePort['setSeasonCheckTime']>().mockResolvedValue(undefined),
  };
}

/**
 * Mounts the hook over a settings module in the given state.
 * @param port The fake port.
 * @param settings The settings module's readiness.
 * @returns The hook handle.
 */
function renderCheckTime(port: CheckTimePort, settings: Omit<ModuleReadiness, 'module'> = { state: 'ready' }) {
  return renderHook(() => useIntakeCheckTime(port), {
    wrapper: createModulesTestWrapper({ module: 'settings', ...settings }).wrapper,
  });
}

/**
 * Mounts the hook over a ready settings module and waits for the stored time.
 * @param port The fake port.
 * @returns The hook handle.
 */
async function renderLoaded(port: CheckTimePort) {
  const hook = renderCheckTime(port);
  await waitFor(() => expect(hook.result.current.view.kind).toBe('ready'));
  return hook;
}

describe('useIntakeCheckTime', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads the stored check time closed', async () => {
    const { result } = await renderLoaded(fakePort('06:15'));
    expect(result.current.view).toEqual({ kind: 'ready', data: '06:15', isRefreshing: false });
    expect(result.current.isOpen).toBe(false);
  });

  it('stays loading without a read while the settings module starts', async () => {
    const port = fakePort();
    const { result } = renderCheckTime(port, { state: 'starting' });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.view).toEqual({ kind: 'loading' });
    expect(port.getSeasonCheckTime).not.toHaveBeenCalled();
  });

  it('reports a failed settings module as a failure, never as a loaded time', async () => {
    const port = fakePort();
    const { result } = renderCheckTime(port, { state: 'failed', reason: 'settings store corrupt' });

    await waitFor(() => expect(result.current.view.kind).toBe('failure'));
    expect(result.current.view).toMatchObject({ code: 'failed_precondition' });
    expect(port.getSeasonCheckTime).not.toHaveBeenCalled();
  });

  it('reports a rejected read as a failure carrying the bridge message', async () => {
    const port = fakePort();
    port.getSeasonCheckTime.mockRejectedValue(createBridgeError('internal', 'read settings: disk I/O error'));
    const { result } = renderCheckTime(port);

    await waitFor(() => expect(result.current.view).toEqual({ kind: 'failure', code: 'internal', message: 'read settings: disk I/O error' }));
  });

  it('refuses an incomplete field, reopens on the saved time, then saves the edit, re-reads and closes', async () => {
    const port = fakePort('21:00');
    const { result } = await renderLoaded(port);
    act(() => result.current.onOpenChange(true));
    act(() => result.current.onDraftChange(null));
    act(() => result.current.onSave());

    // An incomplete field never reaches the backend.
    expect(port.setSeasonCheckTime).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toBe(CHECK_TIME_EMPTY_MESSAGE);

    // Reopening shows the saved time in the field and no stale error.
    act(() => result.current.onOpenChange(false));
    act(() => result.current.onDraftChange(new Time(5, 0)));
    act(() => result.current.onOpenChange(true));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.draft).toEqual(new Time(21, 0));
    expect(result.current.errorMessage).toBeUndefined();

    act(() => result.current.onDraftChange(new Time(6, 15)));
    port.getSeasonCheckTime.mockResolvedValue('06:15');

    act(() => result.current.onSave());

    await waitFor(() => expect(result.current.isOpen).toBe(false));
    expect(port.setSeasonCheckTime).toHaveBeenCalledExactlyOnceWith('06:15');
    await waitFor(() => expect(result.current.view).toMatchObject({ kind: 'ready', data: '06:15' }));
    expect(result.current.isSaving).toBe(false);
    expect(toastMock.danger).not.toHaveBeenCalled();
  });

  it.each([
    ['the bridge message', createBridgeError('invalid_argument', 'invalid time "9:00": use HH:MM (00:00-23:59)'), 'invalid time "9:00": use HH:MM (00:00-23:59)'],
    ['the fallback without one', new Error(''), CHECK_TIME_SAVE_FAILED_MESSAGE],
  ])('toasts a rejected save with %s and keeps the popover open on the old time', async (_case, failure, expected) => {
    const port = fakePort('21:00');
    port.setSeasonCheckTime.mockRejectedValue(failure);
    const { result } = await renderLoaded(port);
    act(() => result.current.onOpenChange(true));
    act(() => result.current.onDraftChange(new Time(6, 15)));

    act(() => result.current.onSave());

    await waitFor(() => expect(toastMock.danger).toHaveBeenCalledExactlyOnceWith(expected));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.view).toMatchObject({ kind: 'ready', data: '21:00' });
    await waitFor(() => expect(result.current.isSaving).toBe(false));
  });

  it('reports saving while the backend call is in flight', async () => {
    const port = fakePort('21:00');
    let finish: () => void = () => undefined;
    port.setSeasonCheckTime.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const { result } = await renderLoaded(port);
    act(() => result.current.onOpenChange(true));

    act(() => result.current.onSave());
    await waitFor(() => expect(result.current.isSaving).toBe(true));

    await act(async () => {
      finish();
    });
    await waitFor(() => expect(result.current.isSaving).toBe(false));
  });
});
