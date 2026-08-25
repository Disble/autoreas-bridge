import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useBackendEventResolver } from '../use-backend-event-resolver';
import type { Notification } from '../../../../../shared/contracts/notification.types';
import type { NotificationSource } from '../../../../../infrastructure/notification-source/notification-source.types';

/** A fake source whose `subscribe`/`subscribeArchived` fire once, synchronously, with the given fixtures. */
function createFakeSource(
  notification: Notification | undefined,
  archivedIds: readonly number[] | undefined,
): NotificationSource {
  return {
    subscribe(listener) {
      if (notification) {
        listener(notification);
      }
      return () => undefined;
    },
    subscribeArchived(listener) {
      if (archivedIds) {
        listener(archivedIds);
      }
      return () => undefined;
    },
    // Routing is not this resolver's stream: `NotificationNavigationListener`
    // owns `notification.navigate`, mounted separately in `AppLayout`.
    subscribeNavigate: () => () => undefined,
  };
}

/**
 * A fake source that keeps its listener instead of firing immediately, so a
 * test can re-render the hook first and then deliver an event.
 */
function createDeferredSource(): {
  readonly source: NotificationSource;
  readonly emit: (notification: Notification) => void;
} {
  let captured: ((notification: Notification) => void) | undefined;

  return {
    source: {
      subscribe(listener) {
        captured = listener;
        return () => undefined;
      },
      subscribeArchived() {
        return () => undefined;
      },
      subscribeNavigate() {
        return () => undefined;
      },
    },
    emit(notification) {
      captured?.(notification);
    },
  };
}

describe('useBackendEventResolver', () => {
  it('delivers to the latest push after a re-render, not the one captured on mount', () => {
    const firstPush = vi.fn();
    const latestPush = vi.fn();
    const remove = vi.fn();
    const { source, emit } = createDeferredSource();

    const { rerender } = renderHook(({ push }) => useBackendEventResolver(push, remove, source), {
      initialProps: { push: firstPush },
    });
    rerender({ push: latestPush });
    emit({
      Title: 'Download run completed',
      Body: '3 episode(s) downloaded.',
      Level: 'success',
      Source: 'download',
      CorrelationID: 'run-8f21c4',
      Timestamp: '2026-08-23T14:32:00Z',
    });

    // The subscription is keyed on `source` alone so it is not torn down and
    // rebuilt on every render. That only stays correct while the ref holding
    // `push` is refreshed after each commit -- drop that and this hook keeps
    // calling whichever callback happened to exist on mount.
    expect(latestPush).toHaveBeenCalledTimes(1);
    expect(firstPush).not.toHaveBeenCalled();
  });

  it('forwards Source, CorrelationID, Timestamp, and RecordID unchanged (Bug A guard)', () => {
    const push = vi.fn();
    const remove = vi.fn();
    const notification: Notification = {
      Title: 'Download finished',
      Body: 'Episode 4 downloaded',
      Level: 'success',
      Source: 'download',
      CorrelationID: 'corr-123',
      Timestamp: '2026-08-23T10:00:00.000Z',
      RecordID: 42,
    };

    renderHook(() => useBackendEventResolver(push, remove, createFakeSource(notification, undefined)));

    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'download',
        correlationId: 'corr-123',
        timestamp: '2026-08-23T10:00:00.000Z',
        recordId: 42,
      }),
    );
  });

  it('renders no toast for a kind a dedicated resolver already owns', () => {
    const push = vi.fn();
    const remove = vi.fn();
    const notification: Notification = {
      Title: 'Missed selected day',
      Body: 'The scheduled download for 2026-07-26 did not run.',
      Level: 'warning',
      Source: 'schedule',
      Kind: 'missed_schedule',
      CorrelationID: '',
      Timestamp: '2026-07-26T21:05:00.000Z',
    };

    renderHook(() => useBackendEventResolver(push, remove, createFakeSource(notification, undefined)));

    // The backend now persists this notification so it can be found again, but
    // `useMissedScheduleResolver` still renders it -- as a persistent toast
    // carrying "Run now"/"Ignore". This generic path can render neither
    // (`ActionSpec` arrives without the action ids a press needs, and
    // `RecordID` is never populated), so letting it push too would put a
    // strictly poorer duplicate on screen beside the real one.
    expect(push).not.toHaveBeenCalled();
  });

  it('still renders a toast for a kind no dedicated resolver claims', () => {
    const push = vi.fn();
    const remove = vi.fn();
    const notification: Notification = {
      Title: 'Download run completed',
      Body: '3 episode(s) downloaded.',
      Level: 'success',
      Source: 'download',
      Kind: 'run_completed',
      CorrelationID: 'run-8f21c4',
      Timestamp: '2026-08-23T14:32:00Z',
    };

    renderHook(() => useBackendEventResolver(push, remove, createFakeSource(notification, undefined)));

    expect(push).toHaveBeenCalledTimes(1);
  });

  it('still renders a toast for a producer that reports no kind at all', () => {
    const push = vi.fn();
    const remove = vi.fn();
    const notification: Notification = {
      Title: 'Pairing complete',
      Body: 'A device finished pairing.',
      Level: 'info',
      Source: 'device',
      CorrelationID: '',
      Timestamp: '2026-08-23T14:32:00Z',
    };

    renderHook(() => useBackendEventResolver(push, remove, createFakeSource(notification, undefined)));

    // An empty kind means "this producer has not adopted the vocabulary yet",
    // never "some resolver has claimed this". Reading absence as a claim would
    // silently mute every producer that has not been given a kind.
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('a notification.archived event calls remove(...) for each archived record id (Decision G)', () => {
    const push = vi.fn();
    const remove = vi.fn();

    renderHook(() => useBackendEventResolver(push, remove, createFakeSource(undefined, [7, 9])));

    expect(remove).toHaveBeenCalledWith(7);
    expect(remove).toHaveBeenCalledWith(9);
  });
});
