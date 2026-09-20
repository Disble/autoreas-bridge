import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureTransactionSource } from '../../../../../infrastructure/capture-transaction-source/capture-transaction-source.types';
import type { RuntimeEventSource } from '../../../../../infrastructure/runtime-event-source/runtime-event-source.types';
import type { CaptureSummary } from '../../../../../shared/contracts/capture.types';
import type { RuntimeEventSummary } from '../../../../../shared/contracts/runtime-event.types';
import { ActivityOverview } from '../ActivityOverview';
import { NETWORK_EVENTS_DEGRADED_MESSAGE } from '../../NetworkPanel/network-panel.constants';
import {
  OVERVIEW_EVENTS_EMPTY_MESSAGE,
  OVERVIEW_EVENT_SUMMARY_DESCRIPTION,
  OVERVIEW_LOADING_MESSAGE,
  OVERVIEW_PARITY_NOTE,
  OVERVIEW_REQUESTS_DEGRADED_MESSAGE,
  OVERVIEW_REQUEST_HEALTH_TITLE,
  OVERVIEW_SKELETON_ROW_COUNT,
  OVERVIEW_UNMEASURED_DESCRIPTION,
} from '../activity-overview.constants';

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

/** Builds a fake runtime-event source whose aggregation never resolves, to hold a reload in flight. */
function createStalledEventSource(): RuntimeEventSource {
  return {
    searchEvents: vi.fn(),
    summarizeEvents: vi.fn().mockReturnValue(new Promise(() => undefined)),
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

  it.each([
    {
      description: 'an available healthy read',
      summary: eventSummary(),
      header: OVERVIEW_EVENT_SUMMARY_DESCRIPTION,
      alertText: null,
      emptyCopies: 3,
    },
    {
      description: 'a degraded read',
      summary: eventSummary({ degraded: true }),
      header: OVERVIEW_UNMEASURED_DESCRIPTION,
      alertText: NETWORK_EVENTS_DEGRADED_MESSAGE,
      emptyCopies: 0,
    },
  ])('renders the runtime-events header state of $description', async ({ summary, header, alertText, emptyCopies }) => {
    const { container } = render(<ActivityOverview captureSource={createFakeCaptureSource()} eventSource={createFakeEventSource(summary)} />);

    // The header states which of the two card descriptions applies, the
    // degraded alert is present exactly when the read failed, and the healthy
    // empty state renders once per grouping section — a swapped branch, a
    // negated equality or a dropped renderEmptyState fails one of these.
    expect(await screen.findByText(header)).toBeInTheDocument();
    expect(screen.queryAllByText(OVERVIEW_EVENTS_EMPTY_MESSAGE)).toHaveLength(emptyCopies);
    const alert = container.querySelector('[data-slot="alert-root"]');
    if (alertText === null) {
      expect(alert).toBeNull();
    } else {
      expect(alert).not.toBeNull();
      expect(alert).toHaveTextContent(alertText);
    }
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

  it.each([
    {
      description: 'a healthy read with one group',
      summary: requestSummary({
        groups: [{ route: '/api/animes', httpStatus: 202, outcome: 'accepted', count: 472, latestErrorSamples: [] }],
      }),
      header: '472 captured requests across 1 route/status/outcome groups',
      alertText: null,
    },
    {
      description: 'a degraded read',
      summary: requestSummary({ degraded: true }),
      header: OVERVIEW_UNMEASURED_DESCRIPTION,
      alertText: OVERVIEW_REQUESTS_DEGRADED_MESSAGE,
    },
  ])('renders the request-health header state of $description', async ({ summary, header, alertText }) => {
    const { container } = render(<ActivityOverview captureSource={createFakeCaptureSource(summary)} eventSource={createFakeEventSource()} />);

    // The header states which of the two card descriptions applies and the
    // degraded alert is present exactly when the read failed — a swapped
    // branch or a negated equality fails one of the two rows.
    expect(await screen.findByText(header)).toBeInTheDocument();
    const alert = container.querySelector('[data-slot="alert-root"]');
    if (alertText === null) {
      expect(alert).toBeNull();
    } else {
      expect(alert).not.toBeNull();
      expect(alert).toHaveTextContent(alertText);
    }
  });

  it('states that the two stores are summarized separately, so the missing timeline is an exclusion and not a gap', async () => {
    render(<ActivityOverview captureSource={createFakeCaptureSource()} eventSource={createFakeEventSource()} />);

    await waitFor(() => {
      expect(screen.getByText(/no merged correlation timeline/)).toBeInTheDocument();
    });
  });

  it('keeps every table header, marks every table busy, names the load and renders placeholder rows while both aggregations are unresolved', () => {
    const { container } = render(<ActivityOverview captureSource={createFakeCaptureSource()} eventSource={createFakeEventSource()} />);

    expect(screen.getByRole('columnheader', { name: 'Route' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader', { name: 'Key' })).toHaveLength(3);
    expect(container.querySelectorAll('[data-slot="table"][aria-busy="true"]')).toHaveLength(4);
    expect(screen.getAllByRole('status', { name: OVERVIEW_LOADING_MESSAGE })).toHaveLength(2);
    expect(screen.getAllByTestId('activity-overview-request-skeleton-row')).toHaveLength(OVERVIEW_SKELETON_ROW_COUNT);
    expect(screen.getAllByTestId('activity-overview-event-skeleton-row')).toHaveLength(OVERVIEW_SKELETON_ROW_COUNT * 3);
    expect(screen.getAllByTestId('activity-overview-sample-skeleton-row')).toHaveLength(OVERVIEW_SKELETON_ROW_COUNT);
    // Each skeleton row also carries its sectioned key: the per-section prefix
    // keeps placeholder rows addressable per grouping table instead of
    // colliding across the three event tables (React Aria renders the row's
    // collection key as `data-key`).
    expect(screen.getAllByTestId('activity-overview-request-skeleton-row').map((row) => row.getAttribute('data-key'))).toEqual([
      'activity-overview-request-skeleton-0',
      'activity-overview-request-skeleton-1',
      'activity-overview-request-skeleton-2',
      'activity-overview-request-skeleton-3',
    ]);
    const eventSkeletonKeys = screen.getAllByTestId('activity-overview-event-skeleton-row').map((row) => row.getAttribute('data-key'));
    expect(eventSkeletonKeys).toContain('activity-overview-event-skeleton-domain-0');
    expect(eventSkeletonKeys).toContain('activity-overview-event-skeleton-level-0');
    expect(eventSkeletonKeys).toContain('activity-overview-event-skeleton-eventType-3');
  });

  it('drops the busy flag, the status regions and the placeholders once both aggregations resolve', async () => {
    render(<ActivityOverview captureSource={createFakeCaptureSource()} eventSource={createFakeEventSource()} />);

    await screen.findByText('No captured requests match the current filters.');

    expect(screen.queryAllByRole('status')).toHaveLength(0);
    expect(screen.queryAllByTestId('activity-overview-request-skeleton-row')).toHaveLength(0);
    expect(screen.queryAllByTestId('activity-overview-event-skeleton-row')).toHaveLength(0);
    expect(screen.queryAllByTestId('activity-overview-sample-skeleton-row')).toHaveLength(0);
  });

  it('renders the status strip the route composes above its aggregation content', async () => {
    render(
      <ActivityOverview
        statusStrip={<div data-testid="bridge-status-strip">bridge status</div>}
        captureSource={createFakeCaptureSource()}
        eventSource={createFakeEventSource()}
      />,
    );

    const strip = screen.getByTestId('bridge-status-strip');
    // Placement is part of the contract: the strip sits ABOVE everything the
    // tab aggregates — the parity note AND the request-health card — never
    // between or after them.
    const parityNote = screen.getByText(OVERVIEW_PARITY_NOTE);
    expect(strip.compareDocumentPosition(parityNote) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const requestHealthTitle = screen.getByText(OVERVIEW_REQUEST_HEALTH_TITLE);
    expect(strip.compareDocumentPosition(requestHealthTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The strip is an addition, not a replacement: the tab's own aggregation
    // content still resolves and renders.
    expect(await screen.findByText('No captured requests match the current filters.')).toBeInTheDocument();
  });

  it('renders no strip wrapper when the route composes none', () => {
    render(<ActivityOverview captureSource={createFakeCaptureSource()} eventSource={createFakeEventSource()} />);

    expect(screen.queryByTestId('bridge-status-strip')).not.toBeInTheDocument();
    // A condition negated on the wrapper still renders an empty wrapper <div>
    // when no strip exists, which no test id catches: without a strip the
    // parity note is the root container's first child, with nothing before it.
    const parityNote = screen.getByText(OVERVIEW_PARITY_NOTE);
    expect(parityNote.parentElement?.firstElementChild).toBe(parityNote);
  });

  it('renders no real event row while a reload keeps the previous grouping and sets isLoading', async () => {
    const { rerender } = render(
      <ActivityOverview
        captureSource={createFakeCaptureSource()}
        eventSource={createFakeEventSource(eventSummary({ byDomain: [{ key: 'websocket', count: 1693 }] }))}
      />,
    );

    await screen.findByText('websocket');

    // The read effect's dependency array is [captureSource, eventSource], so a
    // fresh source pair re-runs it: isLoading flips back to true before the
    // second read resolves, but `websocket` from the first, already-resolved
    // read is still sitting in state until it does (here: forever, since this
    // source never resolves). That is the real reload state the skeleton must
    // replace rather than sit on top of.
    rerender(
      <ActivityOverview captureSource={createFakeCaptureSource()} eventSource={createStalledEventSource()} />,
    );

    await screen.findAllByTestId('activity-overview-event-skeleton-row');
    expect(screen.queryByText('websocket')).not.toBeInTheDocument();
  });
});
