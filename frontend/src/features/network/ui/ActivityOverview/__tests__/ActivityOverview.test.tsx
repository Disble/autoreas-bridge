import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureTransactionSource } from '../../../../../infrastructure/capture-transaction-source/capture-transaction-source.types';
import type { RuntimeEventSource } from '../../../../../infrastructure/runtime-event-source/runtime-event-source.types';
import type { CaptureSummary } from '../../../../../shared/contracts/capture.types';
import type { RuntimeEventSummary } from '../../../../../shared/contracts/runtime-event.types';
import { ActivityOverview } from '../ActivityOverview';

/** Builds a request-health aggregation envelope, defaulting to a healthy read. */
function requestSummary(overrides: Partial<CaptureSummary> = {}): CaptureSummary {
  return { groups: [], degraded: false, ...overrides };
}

/** Builds a runtime-event aggregation envelope, defaulting to an available, healthy read. */
function eventSummary(overrides: Partial<RuntimeEventSummary> = {}): RuntimeEventSummary {
  return { byDomain: [], byLevel: [], byEventType: [], samples: [], available: true, degraded: false, ...overrides };
}

/** Builds a fake capture source whose aggregation resolves with the given summary. */
function createFakeCaptureSource(summary: CaptureSummary = requestSummary()): CaptureTransactionSource {
  return {
    listTransactions: vi.fn(),
    getTransaction: vi.fn(),
    summarizeTransactions: vi.fn().mockResolvedValue(summary),
  };
}

/** Builds a fake runtime-event source whose aggregation resolves with the given summary. */
function createFakeEventSource(summary: RuntimeEventSummary = eventSummary()): RuntimeEventSource {
  return {
    searchEvents: vi.fn(),
    summarizeEvents: vi.fn().mockResolvedValue(summary),
    subscribe: vi.fn().mockReturnValue(() => undefined),
  };
}

describe('ActivityOverview', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders one request-health row per group with its route, status, outcome and count', async () => {
    render(
      <ActivityOverview
        captureSource={createFakeCaptureSource(
          requestSummary({
            groups: [
              { route: '/api/animes', httpStatus: 202, outcome: 'accepted', count: 472, latestErrorSamples: [] },
            ],
          }),
        )}
        eventSource={createFakeEventSource()}
      />,
    );

    const row = await screen.findByRole('row', { name: /\/api\/animes/ });
    expect(within(row).getByText('202')).toBeInTheDocument();
    expect(within(row).getByText('accepted')).toBeInTheDocument();
    expect(within(row).getByText('472')).toBeInTheDocument();
  });

  it('names a statusless group instead of dropping it or rendering a status the bridge never returned', async () => {
    render(
      <ActivityOverview
        captureSource={createFakeCaptureSource(
          requestSummary({ groups: [{ route: '/ws/sync', outcome: 'pushed', count: 246, latestErrorSamples: [] }] }),
        )}
        eventSource={createFakeEventSource()}
      />,
    );

    const row = await screen.findByRole('row', { name: /\/ws\/sync/ });
    expect(within(row).getByText('No status')).toBeInTheDocument();
    expect(within(row).queryByText('0')).not.toBeInTheDocument();
  });

  it('renders a group error sample so a failing group can be opened without a second query', async () => {
    render(
      <ActivityOverview
        captureSource={createFakeCaptureSource(
          requestSummary({
            groups: [
              {
                route: '/api/animes',
                httpStatus: 404,
                outcome: 'abandoned',
                count: 4,
                latestErrorSamples: [{ requestId: 'req-9', capturedAtMs: 1755000000000, errorCode: 'not_found' }],
              },
            ],
          }),
        )}
        eventSource={createFakeEventSource()}
      />,
    );

    expect(await screen.findByText('not_found')).toBeInTheDocument();
  });

  it('renders the three independent runtime-event groupings', async () => {
    render(
      <ActivityOverview
        captureSource={createFakeCaptureSource()}
        eventSource={createFakeEventSource(
          eventSummary({
            byDomain: [{ key: 'websocket', count: 1693 }],
            byLevel: [{ key: 'info', count: 4457 }],
            byEventType: [{ key: 'sync.pushed', count: 12 }],
          }),
        )}
      />,
    );

    expect(await screen.findByText('By domain')).toBeInTheDocument();
    expect(screen.getByText('By level')).toBeInTheDocument();
    expect(screen.getByText('By event type')).toBeInTheDocument();
    expect(screen.getByText('websocket')).toBeInTheDocument();
    expect(screen.getByText('1693')).toBeInTheDocument();
  });

  it('renders the bounded newest-event samples', async () => {
    render(
      <ActivityOverview
        captureSource={createFakeCaptureSource()}
        eventSource={createFakeEventSource(
          eventSummary({
            samples: [{ id: 7, occurredAtMs: 1755000000000, domain: 'download', level: 'error', message: 'run failed' }],
          }),
        )}
      />,
    );

    expect(await screen.findByText('run failed')).toBeInTheDocument();
  });

  it('reports an unavailable event store rather than presenting its zeroed counts as a measurement', async () => {
    render(
      <ActivityOverview
        captureSource={createFakeCaptureSource()}
        eventSource={createFakeEventSource(eventSummary({ available: false }))}
      />,
    );

    // The disclosure REPLACES the three grouping tables. Rendering them empty
    // beside it would put zero counts on screen as if they had been measured,
    // and would repeat the same sentence once per table.
    expect(await screen.findByText(/This database has no persisted runtime-event store/)).toBeInTheDocument();
    expect(screen.queryByText('No persisted runtime events have been recorded yet.')).not.toBeInTheDocument();
    expect(screen.queryByText('By domain')).not.toBeInTheDocument();
    expect(screen.queryByText('Newest events')).not.toBeInTheDocument();
  });

  it('discloses a failed captured-request read', async () => {
    render(
      <ActivityOverview
        captureSource={createFakeCaptureSource(requestSummary({ degraded: true }))}
        eventSource={createFakeEventSource()}
      />,
    );

    expect(await screen.findByText(/captured-request store could not be read/)).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Route' })).not.toBeInTheDocument();
    expect(screen.queryByText(/0 captured requests across/)).not.toBeInTheDocument();
  });

  it('states that the two stores are summarized separately, so the missing timeline is an exclusion and not a gap', async () => {
    render(<ActivityOverview captureSource={createFakeCaptureSource()} eventSource={createFakeEventSource()} />);

    await waitFor(() => {
      expect(screen.getByText(/no merged correlation timeline/)).toBeInTheDocument();
    });
  });
});
