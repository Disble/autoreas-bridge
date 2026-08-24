import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { NotificationAction } from '../../../../../shared/contracts/notification-center.types';
import { useNotificationAction } from '../use-notification-action';

/** Minimal action fixture builder, matching `notification-detail.helpers.test.ts`'s own. */
function buildAction(overrides: Partial<NotificationAction> = {}): NotificationAction {
  return { id: 'action-1', intent: 'download.run_anime', label: 'Run this anime again', ...overrides };
}

describe('useNotificationAction', () => {
  it('starts idle and enabled for a fresh action', () => {
    const { result } = renderHook(() => useNotificationAction(buildAction()));

    expect(result.current.status).toBe('idle');
    expect(result.current.isDisabled).toBe(false);
    expect(result.current.refusalMessage).toBeUndefined();
  });

  it('reports executed and permanently disabled for an already-executed action, without ever entering pending', () => {
    const { result } = renderHook(() => useNotificationAction(buildAction({ executedAtMs: 1_700_000_000_000 })));

    act(() => {
      result.current.press();
    });

    expect(result.current.status).toBe('executed');
    expect(result.current.isDisabled).toBe(true);
  });

  it('reports the server-known refusal reason for an already-refused action', () => {
    const { result } = renderHook(() => useNotificationAction(buildAction({ refusedReason: 'target_missing' })));

    expect(result.current.status).toBe('refused');
    expect(result.current.isDisabled).toBe(true);
    expect(result.current.refusalMessage).toBe('The thing this action pointed at is gone.');
  });

  it('reports no refusal message for an executed action, even though refusedReason happens to be set too', () => {
    const { result } = renderHook(() => useNotificationAction(buildAction({ executedAtMs: 1, refusedReason: 'target_missing' })));

    expect(result.current.status).toBe('executed');
    expect(result.current.refusalMessage).toBeUndefined();
  });

  it('recomputes the server-known status when a fresh action prop is passed in', () => {
    const { rerender, result } = renderHook((action: NotificationAction) => useNotificationAction(action), { initialProps: buildAction() });

    expect(result.current.status).toBe('idle');

    rerender(buildAction({ executedAtMs: 1_700_000_000_000 }));

    expect(result.current.status).toBe('executed');
  });

  it('disables optimistically the instant it is pressed, before the inert settle step resolves', () => {
    const { result } = renderHook(() => useNotificationAction(buildAction()));

    act(() => {
      result.current.press();
    });

    expect(result.current.status).toBe('pending');
    expect(result.current.isDisabled).toBe(true);
  });

  it('settles a press to intent_unregistered -- the designed, tested inert state until Slice 5 registers real intents', async () => {
    const { result } = renderHook(() => useNotificationAction(buildAction()));

    await act(async () => {
      result.current.press();
      await Promise.resolve();
    });

    expect(result.current.status).toBe('refused');
    expect(result.current.refusalMessage).toBe('This action is not available yet.');
    expect(result.current.isDisabled).toBe(true);
  });

  it('ignores a second press received while the first is still pending, never restarting the settle step', async () => {
    const { result } = renderHook(() => useNotificationAction(buildAction()));

    await act(async () => {
      result.current.press();
      result.current.press();
      await Promise.resolve();
    });

    expect(result.current.status).toBe('refused');
  });
});
