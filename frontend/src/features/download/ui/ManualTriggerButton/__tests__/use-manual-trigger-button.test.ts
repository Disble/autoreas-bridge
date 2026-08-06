import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useManualTriggerButton } from '../use-manual-trigger-button';
import type { DownloadRuntimeSource } from '../../../../../infrastructure/download-runtime-source/download-runtime-source.types';

function createSource(overrides: Partial<DownloadRuntimeSource> = {}): DownloadRuntimeSource {
  return {
    getDownloadConfig: vi.fn(),
    getJDStatus: vi.fn(),
    setJDConfig: vi.fn(),
    getScheduleConfig: vi.fn(),
    setScheduleConfig: vi.fn(),
    setHosterPriority: vi.fn(),
    setEpisodeRenameEnabled: vi.fn().mockResolvedValue('ok'),
    triggerDownloadCheck: vi.fn().mockResolvedValue('ok'),
    triggerAnimeDownload: vi.fn(),
    cancelDownloadRun: vi.fn().mockResolvedValue('ok'),
    runMissedScheduleNow: vi.fn(),
    ignoreMissedSchedule: vi.fn(),
    listDownloadRuns: vi.fn(),
    listDownloadReadiness: vi.fn(),
    subscribeRunEvents: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

describe('useManualTriggerButton', () => {
  it('starts in the "idle" status', () => {
    const source = createSource();
    const { result } = renderHook(() => useManualTriggerButton(source));

    expect(result.current.viewModel.status).toBe('idle');
  });

  it('moves to "triggering" while the call is in flight, then "success"', async () => {
    let resolveTrigger: (value: string) => void = () => {};
    let pendingTrigger: Promise<void> | undefined;
    const source = createSource({
      triggerDownloadCheck: vi.fn().mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            resolveTrigger = resolve;
          }),
      ),
    });
    const { result } = renderHook(() => useManualTriggerButton(source));

    act(() => {
      pendingTrigger = result.current.trigger();
    });

    await waitFor(() => expect(result.current.viewModel.status).toBe('triggering'));

    await act(async () => {
      resolveTrigger('ok');
      await pendingTrigger;
    });

    await waitFor(() => expect(result.current.viewModel.status).toBe('success'));
  });

  it('moves to "already-in-progress" when the backend reports a concurrent run', async () => {
    const source = createSource({
      triggerDownloadCheck: vi.fn().mockResolvedValue('schedule: a download run is already in progress'),
    triggerAnimeDownload: vi.fn(),
    });
    const { result } = renderHook(() => useManualTriggerButton(source));

    await act(async () => {
      await result.current.trigger();
    });

    expect(result.current.viewModel.status).toBe('already-in-progress');
  });

  it('moves to "error" with the message when the backend reports a generic failure', async () => {
    const source = createSource({
      triggerDownloadCheck: vi.fn().mockResolvedValue('download scheduler unavailable'),
    triggerAnimeDownload: vi.fn(),
    });
    const { result } = renderHook(() => useManualTriggerButton(source));

    await act(async () => {
      await result.current.trigger();
    });

    expect(result.current.viewModel.status).toBe('error');
    expect(result.current.viewModel.errorMessage).toBe('download scheduler unavailable');
  });

  it('moves to "error" when triggerDownloadCheck rejects', async () => {
    const source = createSource({ triggerDownloadCheck: vi.fn().mockRejectedValue(new Error('network down')) });
    const { result } = renderHook(() => useManualTriggerButton(source));

    await act(async () => {
      await result.current.trigger();
    });

    expect(result.current.viewModel.status).toBe('error');
    expect(result.current.viewModel.errorMessage).toBe('network down');
  });
});
