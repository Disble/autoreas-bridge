import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useManualTriggerButton } from '../use-manual-trigger-button';
import type { DownloadsSource } from '../../../../../shared/contracts/download.types';
import { createDownloadsSourceFake, createDownloadsWrapper } from '../../../../../shared/hooks/use-missed-schedule-notice/__tests__/downloads.test-support';

/**
 * Builds a fully stubbed downloads port, overridable per case.
 * @param overrides The calls a case replaces.
 * @returns The port.
 */
function createSource(overrides: Partial<DownloadsSource> = {}): DownloadsSource {
  return createDownloadsSourceFake(overrides);
}

describe('useManualTriggerButton', () => {
  it('starts in the "idle" status, moves to "triggering" while the call is in flight, then "success"', async () => {
    let resolveTrigger: (value: undefined) => void = () => {};
    let pendingTrigger: Promise<void> | undefined;
    const source = createSource({
      triggerDownloadCheck: vi.fn().mockImplementation(
        () =>
          new Promise<undefined>((resolve) => {
            resolveTrigger = resolve;
          }),
      ),
    });
    const { result } = renderHook(() => useManualTriggerButton(source), { wrapper: createDownloadsWrapper().wrapper });

    expect(result.current.viewModel.status).toBe('idle');

    act(() => {
      pendingTrigger = result.current.trigger();
    });

    await waitFor(() => expect(result.current.viewModel.status).toBe('triggering'));

    await act(async () => {
      resolveTrigger(undefined);
      await pendingTrigger;
    });

    await waitFor(() => expect(result.current.viewModel.status).toBe('success'));
  });

  it('moves to "already-in-progress" when the backend refuses with the concurrent-run guard', async () => {
    const source = createSource({
      triggerDownloadCheck: vi.fn().mockRejectedValue(new Error('schedule: a download run is already in progress')),
    });
    const { result } = renderHook(() => useManualTriggerButton(source), { wrapper: createDownloadsWrapper().wrapper });

    await act(async () => {
      await result.current.trigger();
    });

    expect(result.current.viewModel.status).toBe('already-in-progress');
  });

  it('moves to "error" with the message when the backend refuses for another reason', async () => {
    const source = createSource({
      triggerDownloadCheck: vi.fn().mockRejectedValue(new Error('download scheduler unavailable')),
    });
    const { result } = renderHook(() => useManualTriggerButton(source), { wrapper: createDownloadsWrapper().wrapper });

    await act(async () => {
      await result.current.trigger();
    });

    expect(result.current.viewModel.status).toBe('error');
    expect(result.current.viewModel.errorMessage).toBe('download scheduler unavailable');
  });
});
