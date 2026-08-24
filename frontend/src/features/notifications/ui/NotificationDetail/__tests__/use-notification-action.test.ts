import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationAction, NotificationActionResult } from '../../../../../shared/contracts/notification-center.types';
import type { NotificationCenterSource } from '../../../../../infrastructure/notification-center-source/notification-center-source.types';
import { useNotificationAction } from '../use-notification-action';

/** Minimal action fixture builder, matching `notification-detail.helpers.test.ts`'s own. */
function buildAction(overrides: Partial<NotificationAction> = {}): NotificationAction {
  return { id: 'action-1', intent: 'download.run_anime', label: 'Run this anime again', ...overrides };
}

/** Builds a fake `NotificationCenterSource` whose `executeAction` resolves to a fixed result, so a test controls settlement timing precisely instead of depending on the real Wails-backed polling source. */
function buildActionSource(result: NotificationActionResult): NotificationCenterSource {
  return { executeAction: vi.fn().mockResolvedValue(result) } as unknown as NotificationCenterSource;
}

describe('useNotificationAction', () => {
  it('starts idle and enabled for a fresh action', () => {
    const { result } = renderHook(() => useNotificationAction(1, buildAction(), buildActionSource({ executed: false, reason: 'intent_unregistered' })));

    expect(result.current.status).toBe('idle');
    expect(result.current.isDisabled).toBe(false);
    expect(result.current.refusalMessage).toBeUndefined();
  });

  it('reports executed and permanently disabled for an already-executed action, without ever entering pending or calling executeAction', () => {
    const source = buildActionSource({ executed: true, executedAtMs: 1_700_000_000_000 });
    const { result } = renderHook(() => useNotificationAction(1, buildAction({ executedAtMs: 1_700_000_000_000 }), source));

    act(() => {
      result.current.press();
    });

    expect(result.current.status).toBe('executed');
    expect(result.current.isDisabled).toBe(true);
    expect(source.executeAction).not.toHaveBeenCalled();
  });

  it('reports the server-known refusal reason for an already-refused action', () => {
    const source = buildActionSource({ executed: false, reason: 'target_missing' });
    const { result } = renderHook(() => useNotificationAction(1, buildAction({ refusedReason: 'target_missing' }), source));

    expect(result.current.status).toBe('refused');
    expect(result.current.isDisabled).toBe(true);
    expect(result.current.refusalMessage).toBe('The thing this action pointed at is gone.');
  });

  it('reports no refusal message for an executed action, even though refusedReason happens to be set too', () => {
    const source = buildActionSource({ executed: true, executedAtMs: 1 });
    const { result } = renderHook(() => useNotificationAction(1, buildAction({ executedAtMs: 1, refusedReason: 'target_missing' }), source));

    expect(result.current.status).toBe('executed');
    expect(result.current.refusalMessage).toBeUndefined();
  });

  it('recomputes the server-known status when a fresh action prop is passed in', () => {
    const source = buildActionSource({ executed: false, reason: 'intent_unregistered' });
    const { rerender, result } = renderHook((action: NotificationAction) => useNotificationAction(1, action, source), { initialProps: buildAction() });

    expect(result.current.status).toBe('idle');

    rerender(buildAction({ executedAtMs: 1_700_000_000_000 }));

    expect(result.current.status).toBe('executed');
  });

  it('disables optimistically the instant it is pressed, before executeAction resolves', () => {
    const source = buildActionSource({ executed: false, reason: 'intent_unregistered' });
    const { result } = renderHook(() => useNotificationAction(1, buildAction(), source));

    act(() => {
      result.current.press();
    });

    expect(result.current.status).toBe('pending');
    expect(result.current.isDisabled).toBe(true);
  });

  it('calls executeAction with the notification id and action id, settling to executed on success', async () => {
    const source = buildActionSource({ executed: true, executedAtMs: 1_700_000_000_000 });
    const { result } = renderHook(() => useNotificationAction(42, buildAction(), source));

    await act(async () => {
      result.current.press();
      await Promise.resolve();
    });

    expect(source.executeAction).toHaveBeenCalledWith(42, 'action-1');
    expect(result.current.status).toBe('executed');
    expect(result.current.isDisabled).toBe(true);
  });

  it('falls back to an empty refusal reason -- and therefore no refusal message -- when the server result omits it', async () => {
    const source = buildActionSource({ executed: false });
    const { result } = renderHook(() => useNotificationAction(1, buildAction(), source));

    await act(async () => {
      result.current.press();
      await Promise.resolve();
    });

    expect(result.current.status).toBe('refused');
    expect(result.current.refusalMessage).toBeUndefined();
    expect(result.current.isDisabled).toBe(true);
  });

  it('settles a press to the server-returned refusal reason', async () => {
    const source = buildActionSource({ executed: false, reason: 'target_missing' });
    const { result } = renderHook(() => useNotificationAction(1, buildAction(), source));

    await act(async () => {
      result.current.press();
      await Promise.resolve();
    });

    expect(result.current.status).toBe('refused');
    expect(result.current.refusalMessage).toBe('The thing this action pointed at is gone.');
    expect(result.current.isDisabled).toBe(true);
  });

  it('captures the latest notification id and action id after a rerender, never a stale closure', async () => {
    const source = buildActionSource({ executed: true, executedAtMs: 1 });
    const { rerender, result } = renderHook(
      (props: { action: NotificationAction; notificationId: number }) => useNotificationAction(props.notificationId, props.action, source),
      { initialProps: { action: buildAction({ id: 'action-1' }), notificationId: 1 } },
    );

    rerender({ action: buildAction({ id: 'action-2' }), notificationId: 2 });

    await act(async () => {
      result.current.press();
      await Promise.resolve();
    });

    expect(source.executeAction).toHaveBeenCalledWith(2, 'action-2');
    expect(source.executeAction).not.toHaveBeenCalledWith(1, 'action-1');
  });

  it('ignores a second press received while the first is still pending, invoking executeAction exactly once', async () => {
    const source = buildActionSource({ executed: false, reason: 'intent_unregistered' });
    const { result } = renderHook(() => useNotificationAction(1, buildAction(), source));

    await act(async () => {
      result.current.press();
      result.current.press();
      await Promise.resolve();
    });

    expect(result.current.status).toBe('refused');
    expect(source.executeAction).toHaveBeenCalledTimes(1);
  });
});
