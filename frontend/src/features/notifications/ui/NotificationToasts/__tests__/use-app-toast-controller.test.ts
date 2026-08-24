import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../app-notification.helpers', () => ({
  renderAppNotificationToast: vi.fn(),
  closeAppNotificationToast: vi.fn(),
}));

import { closeAppNotificationToast, renderAppNotificationToast } from '../app-notification.helpers';
import { useAppToastController } from '../use-app-toast-controller';

/**
 * Pins the ledger semantics extracted out of `NotificationToasts.tsx`
 * (design.md §3 Decision H): a push sharing an already-tracked `dedupeKey`
 * or `recordId` is a no-op, and `remove` closes and forgets the tracked
 * toast regardless of which kind of key it was addressed by.
 *
 * These assertions used to name `toast.close` from `@heroui/react` -- the
 * module-level singleton, which is a DIFFERENT queue instance from the
 * app-owned `appToastQueue` every toast is actually added to. The whole file
 * was green while `remove` closed nothing at all, because a mocked close
 * cannot tell you it addressed the wrong queue. That outcome is now pinned
 * against the real queue in `app-toast-queue.test.ts` and end to end in
 * `NotificationToasts.missed-schedule.integration.test.tsx`; what stays here
 * is the ledger bookkeeping those two cannot see.
 */
describe('useAppToastController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ignores a remove for a key it never tracked, by either kind', () => {
    const { result } = renderHook(() => useAppToastController());

    act(() => {
      result.current.remove('never-pushed');
      result.current.remove(4242);
    });

    // Closing an id the ledger does not hold would close whatever toast the
    // runtime happens to have under that id.
    expect(closeAppNotificationToast).not.toHaveBeenCalled();
  });

  it('tracks a push carrying both keys under one toast id, removable by either', () => {
    vi.mocked(renderAppNotificationToast).mockReturnValue('toast-both');
    const { result } = renderHook(() => useAppToastController());

    act(() => {
      result.current.push({ severity: 'warning', title: 'Both', dedupeKey: 'k', recordId: 7 });
    });
    act(() => {
      result.current.remove(7);
    });

    expect(closeAppNotificationToast).toHaveBeenCalledWith('toast-both');

    // The dedupe ledger still holds the string key, so the same notification
    // cannot re-open itself just because it was closed by its other key.
    act(() => {
      result.current.push({ severity: 'warning', title: 'Both again', dedupeKey: 'k' });
    });

    expect(renderAppNotificationToast).toHaveBeenCalledTimes(1);
  });

  it('lets a key push again once its toast has been removed', () => {
    vi.mocked(renderAppNotificationToast).mockReturnValue('toast-reopen');
    const { result } = renderHook(() => useAppToastController());

    act(() => {
      result.current.push({ severity: 'info', title: 'First', dedupeKey: 'reopen' });
      result.current.remove('reopen');
      result.current.push({ severity: 'info', title: 'Second', dedupeKey: 'reopen' });
    });

    // Remove must forget the entry, not just close the toast -- otherwise a
    // dismissed notice could never be raised again for the rest of the session.
    expect(renderAppNotificationToast).toHaveBeenCalledTimes(2);
  });

  it('dedupes a second push sharing the same dedupeKey', () => {
    vi.mocked(renderAppNotificationToast).mockReturnValueOnce('toast-1');
    const { result } = renderHook(() => useAppToastController());

    act(() => {
      result.current.push({ severity: 'info', title: 'A', dedupeKey: 'x' });
      result.current.push({ severity: 'info', title: 'A2', dedupeKey: 'x' });
    });

    expect(renderAppNotificationToast).toHaveBeenCalledTimes(1);
  });

  it('dedupes a second push sharing the same recordId', () => {
    vi.mocked(renderAppNotificationToast).mockReturnValueOnce('toast-2');
    const { result } = renderHook(() => useAppToastController());

    act(() => {
      result.current.push({ severity: 'info', title: 'B', recordId: 5 });
      result.current.push({ severity: 'info', title: 'B2', recordId: 5 });
    });

    expect(renderAppNotificationToast).toHaveBeenCalledTimes(1);
  });

  it('removes a toast by dedupeKey, closing it and forgetting the ledger entry', () => {
    vi.mocked(renderAppNotificationToast).mockReturnValueOnce('toast-3');
    const { result } = renderHook(() => useAppToastController());

    act(() => {
      result.current.push({ severity: 'warning', title: 'C', dedupeKey: 'y' });
      result.current.remove('y');
    });

    expect(closeAppNotificationToast).toHaveBeenCalledWith('toast-3');
  });

  it('removes a toast by recordId, independent of any dedupeKey', () => {
    vi.mocked(renderAppNotificationToast).mockReturnValueOnce('toast-4');
    const { result } = renderHook(() => useAppToastController());

    act(() => {
      result.current.push({ severity: 'error', title: 'D', recordId: 7 });
      result.current.remove(7);
    });

    expect(closeAppNotificationToast).toHaveBeenCalledWith('toast-4');
  });

  it('a push with neither dedupeKey nor recordId is never deduped', () => {
    vi.mocked(renderAppNotificationToast).mockReturnValueOnce('toast-5').mockReturnValueOnce('toast-6');
    const { result } = renderHook(() => useAppToastController());

    act(() => {
      result.current.push({ severity: 'info', title: 'E' });
      result.current.push({ severity: 'info', title: 'E' });
    });

    expect(renderAppNotificationToast).toHaveBeenCalledTimes(2);
  });
});
