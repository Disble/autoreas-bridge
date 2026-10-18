import { toast } from '@heroui/react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActivitySource } from '../../../activity-source/activity-source.types';
import { ACTIVITY_PIN_FAILURE_MESSAGE, ACTIVITY_PIN_SUCCESS_MESSAGE } from '../activity-screen.constants';
import { useActivityScreen } from '../use-activity-screen';

/** A fake source whose pin the test controls. */
function createFakeSource(pinMoment: ActivitySource['pinMoment']): ActivitySource {
  return { getNow: vi.fn(), pinMoment, subscribeRecorder: () => () => undefined };
}

describe('useActivityScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens on Now and follows the selected tab', () => {
    const { result } = renderHook(() => useActivityScreen(createFakeSource(vi.fn())));

    expect(result.current.selectedTab).toBe('now');
    act(() => result.current.selectTab('history'));
    expect(result.current.selectedTab).toBe('history');
  });

  it('switches to Incidents when Now opens an incident', () => {
    const { result } = renderHook(() => useActivityScreen(createFakeSource(vi.fn())));

    act(() => result.current.openIncident(9));

    expect(result.current.selectedTab).toBe('incidents');
  });

  it('pins the moment, reports it, and is busy only while the write runs', async () => {
    const success = vi.spyOn(toast, 'success').mockReturnValue('t');
    let finish: () => void = () => undefined;
    const pinMoment = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useActivityScreen(createFakeSource(pinMoment)));

    act(() => result.current.pin());
    expect(result.current.isPinning).toBe(true);
    await act(async () => finish());

    expect(pinMoment).toHaveBeenCalledTimes(1);
    expect(success).toHaveBeenCalledWith(ACTIVITY_PIN_SUCCESS_MESSAGE);
    expect(result.current.isPinning).toBe(false);
  });

  it('reports a failed pin', async () => {
    const danger = vi.spyOn(toast, 'danger').mockReturnValue('t');
    const success = vi.spyOn(toast, 'success').mockReturnValue('t');
    const { result } = renderHook(() => useActivityScreen(createFakeSource(() => Promise.reject(new Error('disk')))));

    await act(async () => result.current.pin());

    expect(danger).toHaveBeenCalledWith(ACTIVITY_PIN_FAILURE_MESSAGE);
    expect(success).not.toHaveBeenCalled();
    expect(result.current.isPinning).toBe(false);
  });
});
