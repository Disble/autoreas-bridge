import { describe, expect, it } from 'vitest';
import type { CaptureSummary } from '../../../../../shared/contracts/capture.types';
import type { RuntimeEventSummary } from '../../../../../shared/contracts/runtime-event.types';
import {
  resolveOverviewEmptyMessage,
  resolveRequestSummaryStatusMessage,
  sumRequestCounts,
  toEventSampleRows,
  toEventSummarySections,
  toRequestHealthRows,
  toRequestStatusLabel,
} from '../activity-overview.helpers';

/** Builds a request-health aggregation envelope, defaulting to a healthy read. */
function requestSummary(overrides: Partial<CaptureSummary> = {}): CaptureSummary {
  return { groups: [], degraded: false, ...overrides };
}

/** Builds a runtime-event aggregation envelope, defaulting to an available, healthy read. */
function eventSummary(overrides: Partial<RuntimeEventSummary> = {}): RuntimeEventSummary {
  return { byDomain: [], byLevel: [], byEventType: [], samples: [], available: true, degraded: false, ...overrides };
}

describe('toRequestStatusLabel', () => {
  it('renders a present status as its own number', () => {
    expect(toRequestStatusLabel(404)).toBe('404');
  });

  it('names an absent status instead of collapsing it into a status the bridge never returned', () => {
    // Measured 2026-08-30: 538 of 1,317 stored captures (40.8%) are websocket
    // and carry no HTTP status at all. Rendering them as 0 — or dropping them —
    // would erase two fifths of the real table.
    expect(toRequestStatusLabel(undefined)).toBe('No status');
  });
});

describe('toRequestHealthRows', () => {
  it('projects one row per group, carrying route, status, outcome and count', () => {
    const rows = toRequestHealthRows(
      requestSummary({
        groups: [
          { route: '/api/animes', httpStatus: 200, outcome: 'completed', count: 149, latestErrorSamples: [] },
          { route: '/api/animes', httpStatus: 404, outcome: 'abandoned', count: 4, latestErrorSamples: [] },
        ],
      }),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].route).toBe('/api/animes');
    expect(rows[0].statusLabel).toBe('200');
    expect(rows[0].outcome).toBe('completed');
    expect(rows[0].count).toBe(149);
  });

  it('keeps a statusless group separate from a same-route, same-outcome group that has a status', () => {
    const rows = toRequestHealthRows(
      requestSummary({
        groups: [
          { route: '/ws/sync', outcome: 'pushed', count: 246, latestErrorSamples: [] },
          { route: '/ws/sync', httpStatus: 200, outcome: 'pushed', count: 3, latestErrorSamples: [] },
        ],
      }),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].statusLabel).toBe('No status');
    expect(rows[1].statusLabel).toBe('200');
    expect(rows[0].id).not.toBe(rows[1].id);
  });

  it('projects each group error sample with its code and request id', () => {
    const rows = toRequestHealthRows(
      requestSummary({
        groups: [
          {
            route: '/api/animes',
            httpStatus: 404,
            outcome: 'abandoned',
            count: 2,
            latestErrorSamples: [
              { requestId: 'req-9', capturedAtMs: 1755000000000, errorCode: 'not_found' },
              { requestId: 'req-8', capturedAtMs: 1754000000000, errorCode: 'not_found' },
            ],
          },
        ],
      }),
    );

    expect(rows[0].errorSamples).toHaveLength(2);
    expect(rows[0].errorSamples[0].requestId).toBe('req-9');
    expect(rows[0].errorSamples[0].errorCode).toBe('not_found');
  });

  it('returns no rows for a zeroed aggregation instead of fabricating one', () => {
    expect(toRequestHealthRows(requestSummary())).toEqual([]);
  });
});

describe('sumRequestCounts', () => {
  it('totals every group count', () => {
    expect(
      sumRequestCounts([
        { route: '/a', httpStatus: 200, outcome: 'completed', count: 149, latestErrorSamples: [] },
        { route: '/b', outcome: 'pushed', count: 246, latestErrorSamples: [] },
      ]),
    ).toBe(395);
  });

  it('totals an empty aggregation as zero', () => {
    expect(sumRequestCounts([])).toBe(0);
  });
});

describe('toEventSummarySections', () => {
  it('renders the three independent groupings in domain, level, event-type order', () => {
    const sections = toEventSummarySections(
      eventSummary({
        byDomain: [{ key: 'websocket', count: 1693 }],
        byLevel: [{ key: 'info', count: 4457 }],
        byEventType: [{ key: 'sync.pushed', count: 12 }],
      }),
    );

    expect(sections.map((section) => section.id)).toEqual(['domain', 'level', 'eventType']);
    expect(sections[0].title).toBe('By domain');
    expect(sections[1].title).toBe('By level');
    expect(sections[2].title).toBe('By event type');
  });

  it('reports each bucket share against its own dimension total', () => {
    const sections = toEventSummarySections(
      eventSummary({
        byLevel: [
          { key: 'info', count: 984 },
          { key: 'warn', count: 15 },
          { key: 'error', count: 1 },
        ],
      }),
    );

    expect(sections[1].rows.map((row) => row.shareLabel)).toEqual(['98.4%', '1.5%', '0.1%']);
  });

  it('names an unlabelled key instead of rendering an empty cell', () => {
    const sections = toEventSummarySections(eventSummary({ byEventType: [{ key: '', count: 7 }] }));

    expect(sections[2].rows[0].label).toBe('(unlabelled)');
  });

  it('reports a zero share for a dimension with no rows rather than dividing by zero', () => {
    const sections = toEventSummarySections(eventSummary({ byDomain: [{ key: 'sync', count: 0 }] }));

    expect(sections[0].rows[0].shareLabel).toBe('0.0%');
  });

  it('renders every dimension as an empty row list when nothing matched', () => {
    const sections = toEventSummarySections(eventSummary());

    expect(sections.map((section) => section.rows.length)).toEqual([0, 0, 0]);
  });
});

describe('toEventSampleRows', () => {
  it('projects each sample with its domain, level and message', () => {
    const rows = toEventSampleRows(
      eventSummary({
        samples: [{ id: 42, occurredAtMs: 1755000000000, domain: 'download', level: 'error', message: 'run failed' }],
      }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('42');
    expect(rows[0].domain).toBe('download');
    expect(rows[0].level).toBe('error');
    expect(rows[0].message).toBe('run failed');
    expect(rows[0].timeLabel).not.toBe('');
  });

  it('projects no rows for a zeroed aggregation', () => {
    expect(toEventSampleRows(eventSummary())).toEqual([]);
  });
});

describe('resolveRequestSummaryStatusMessage', () => {
  it('discloses a failed read', () => {
    expect(resolveRequestSummaryStatusMessage(true)).toBe(
      'The captured-request store could not be read, so these counts are not a measured result.',
    );
  });

  it('discloses nothing for a healthy read', () => {
    expect(resolveRequestSummaryStatusMessage(false)).toBeNull();
  });
});

describe('resolveOverviewEmptyMessage', () => {
  it('shows the loading copy while the first read is in flight', () => {
    expect(resolveOverviewEmptyMessage(true, 'nothing here')).toBe('Loading the activity summary…');
  });

  it('shows the surface-specific empty copy for a healthy, resolved, empty read', () => {
    expect(resolveOverviewEmptyMessage(false, 'nothing here')).toBe('nothing here');
  });
});
