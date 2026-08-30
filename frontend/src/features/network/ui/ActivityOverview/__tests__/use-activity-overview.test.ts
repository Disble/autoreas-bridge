import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureTransactionSource } from '../../../../../infrastructure/capture-transaction-source/capture-transaction-source.types';
import type { RuntimeEventSource } from '../../../../../infrastructure/runtime-event-source/runtime-event-source.types';
import type { CaptureSummary } from '../../../../../shared/contracts/capture.types';
import type { RuntimeEventSummary } from '../../../../../shared/contracts/runtime-event.types';
import { useActivityOverview } from '../use-activity-overview';

/** Builds a request-health aggregation envelope, defaulting to a healthy read. */
function requestSummary(overrides: Partial<CaptureSummary> = {}): CaptureSummary {
  return { groups: [], degraded: false, ...overrides };
}

/** Builds a runtime-event aggregation envelope, defaulting to an available, healthy read. */
function eventSummary(overrides: Partial<RuntimeEventSummary> = {}): RuntimeEventSummary {
  return { byDomain: [], byLevel: [], byEventType: [], samples: [], available: true, degraded: false, ...overrides };
}

/** Builds a fake capture source whose aggregation resolves immediately, overridable per test. */
function createFakeCaptureSource(summary: CaptureSummary = requestSummary()): CaptureTransactionSource {
  return {
    listTransactions: vi.fn(),
    getTransaction: vi.fn(),
    summarizeTransactions: vi.fn().mockResolvedValue(summary),
  };
}

/** Builds a fake runtime-event source whose aggregation resolves immediately, overridable per test. */
function createFakeEventSource(summary: RuntimeEventSummary = eventSummary()): RuntimeEventSource {
  return {
    searchEvents: vi.fn(),
    summarizeEvents: vi.fn().mockResolvedValue(summary),
    subscribe: vi.fn().mockReturnValue(() => undefined),
  };
}

describe('useActivityOverview', () => {
  afterEach(() => {
    cleanup();
  });

  it('loads both aggregations once and projects their rows', async () => {
    const captureSource = createFakeCaptureSource(
      requestSummary({
        groups: [{ route: '/api/animes', httpStatus: 200, outcome: 'completed', count: 149, latestErrorSamples: [] }],
      }),
    );
    const eventSource = createFakeEventSource(
      eventSummary({
        byDomain: [{ key: 'websocket', count: 1693 }],
        byLevel: [{ key: 'info', count: 4457 }],
        samples: [{ id: 1, occurredAtMs: 1755000000000, domain: 'sync', level: 'info', message: 'ok' }],
      }),
    );

    const { result } = renderHook(() => useActivityOverview(captureSource, eventSource));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.requestRows).toHaveLength(1);
    expect(result.current.requestRows[0].count).toBe(149);
    expect(result.current.requestCount).toBe(149);
    expect(result.current.eventSections[0].rows[0].label).toBe('websocket');
    expect(result.current.eventSamples).toHaveLength(1);
    expect(captureSource.summarizeTransactions).toHaveBeenCalledTimes(1);
    expect(eventSource.summarizeEvents).toHaveBeenCalledTimes(1);
  });

  it('reports an unavailable event store instead of presenting its zeroed counts as a measurement', async () => {
    const eventSource = createFakeEventSource(eventSummary({ available: false, degraded: false }));

    const { result } = renderHook(() => useActivityOverview(createFakeCaptureSource(), eventSource));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.eventStatusMessage).toBe(
      'This database has no persisted runtime-event store, so no history can be shown. Events recorded from now on will appear after the store is created.',
    );
  });

  it('keeps a failed event read distinct from an absent event store', async () => {
    const eventSource = createFakeEventSource(eventSummary({ available: true, degraded: true }));

    const { result } = renderHook(() => useActivityOverview(createFakeCaptureSource(), eventSource));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.eventStatusMessage).toBe(
      'The persisted runtime-event store could not be read. Showing whatever was already loaded.',
    );
  });

  it('discloses a failed request read rather than showing an empty table', async () => {
    const captureSource = createFakeCaptureSource(requestSummary({ degraded: true }));

    const { result } = renderHook(() => useActivityOverview(captureSource, createFakeEventSource()));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.requestStatusMessage).toBe(
      'The captured-request store could not be read, so these counts are not a measured result.',
    );
  });

  it('discloses nothing while the first read is still in flight', () => {
    const neverResolves = new Promise<never>(() => undefined);
    const captureSource: CaptureTransactionSource = {
      listTransactions: vi.fn(),
      getTransaction: vi.fn(),
      summarizeTransactions: vi.fn().mockReturnValue(neverResolves),
    };
    const eventSource: RuntimeEventSource = {
      searchEvents: vi.fn(),
      summarizeEvents: vi.fn().mockReturnValue(neverResolves),
      subscribe: vi.fn().mockReturnValue(() => undefined),
    };

    const { result } = renderHook(() => useActivityOverview(captureSource, eventSource));

    // The initial state is "no store yet", which is indistinguishable from an
    // absent store. Announcing it before the read resolves would flash a
    // disclosure the surface has no evidence for.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.eventStatusMessage).toBeNull();
    expect(result.current.requestStatusMessage).toBeNull();
    expect(result.current.eventEmptyMessage).toBe('Loading the activity summary…');
  });

  it('shows the healthy empty copy when both aggregations resolve with nothing', async () => {
    const { result } = renderHook(() => useActivityOverview(createFakeCaptureSource(), createFakeEventSource()));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.requestEmptyMessage).toBe('No captured requests match the current filters.');
    expect(result.current.eventEmptyMessage).toBe('No persisted runtime events have been recorded yet.');
  });
});
