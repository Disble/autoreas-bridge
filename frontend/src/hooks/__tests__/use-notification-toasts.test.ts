import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNotificationToasts } from '../use-notification-toasts';
import type { NotificationSource } from '../../infrastructure/notification-source';
import type { Notification } from '../../shared/contracts/notification.types';

const toastMock = vi.hoisted(() => {
  const fn = vi.fn() as unknown as {
    (...args: unknown[]): string;
    success: ReturnType<typeof vi.fn>;
    danger: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warning: ReturnType<typeof vi.fn>;
  };
  fn.success = vi.fn();
  fn.danger = vi.fn();
  fn.info = vi.fn();
  fn.warning = vi.fn();
  return fn;
});

vi.mock('@heroui/react', () => ({
  toast: toastMock,
}));

function createFakeSource(): { source: NotificationSource; emit: (notification: Notification) => void } {
  let listener: ((notification: Notification) => void) | undefined;

  return {
    source: {
      subscribe(callback) {
        listener = callback;
        return () => {
          listener = undefined;
        };
      },
    },
    emit(notification) {
      listener?.(notification);
    },
  };
}

describe('useNotificationToasts', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('maps Level "success" to toast.success', () => {
    const { source, emit } = createFakeSource();
    renderHook(() => useNotificationToasts(source));

    emit({
      Title: 'Download finished',
      Body: '2 episodes downloaded',
      Level: 'success',
      Source: 'download',
      CorrelationID: 'run-1',
      Timestamp: '2026-06-22T00:00:00Z',
    });

    expect(toastMock.success).toHaveBeenCalledTimes(1);
    expect(toastMock.danger).not.toHaveBeenCalled();
  });

  it('maps Level "error" to toast.danger (HeroUI calls the error variant "danger")', () => {
    const { source, emit } = createFakeSource();
    renderHook(() => useNotificationToasts(source));

    emit({
      Title: 'Download failed',
      Body: 'JD offline',
      Level: 'error',
      Source: 'download',
      CorrelationID: 'run-2',
      Timestamp: '2026-06-22T00:00:01Z',
    });

    expect(toastMock.danger).toHaveBeenCalledTimes(1);
  });

  it('maps Level "warning" to toast.warning', () => {
    const { source, emit } = createFakeSource();
    renderHook(() => useNotificationToasts(source));

    emit({
      Title: 'Heads up',
      Body: 'Manual links required',
      Level: 'warning',
      Source: 'download',
      CorrelationID: 'run-3',
      Timestamp: '2026-06-22T00:00:02Z',
    });

    expect(toastMock.warning).toHaveBeenCalledTimes(1);
  });

  it('maps Level "info" to toast.info', () => {
    const { source, emit } = createFakeSource();
    renderHook(() => useNotificationToasts(source));

    emit({
      Title: 'Schedule updated',
      Body: 'Daily run set to 03:00',
      Level: 'info',
      Source: 'download',
      CorrelationID: 'run-4',
      Timestamp: '2026-06-22T00:00:03Z',
    });

    expect(toastMock.info).toHaveBeenCalledTimes(1);
  });

  it('passes Title as the toast message and Body as the description', () => {
    const { source, emit } = createFakeSource();
    renderHook(() => useNotificationToasts(source));

    emit({
      Title: 'Download finished',
      Body: '2 episodes downloaded',
      Level: 'success',
      Source: 'download',
      CorrelationID: 'run-5',
      Timestamp: '2026-06-22T00:00:04Z',
    });

    expect(toastMock.success).toHaveBeenCalledWith(
      'Download finished',
      expect.objectContaining({ description: '2 episodes downloaded' }),
    );
  });

  it('unsubscribes from the source on unmount', () => {
    const unsubscribe = vi.fn();
    const source: NotificationSource = {
      subscribe: vi.fn().mockReturnValue(unsubscribe),
    };

    const { unmount } = renderHook(() => useNotificationToasts(source));
    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
