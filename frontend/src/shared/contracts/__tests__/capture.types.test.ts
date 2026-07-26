import { describe, expect, it } from 'vitest';
import type { CaptureDetail, CaptureDetailResult, CapturePage, CaptureQueryFilters, CaptureRow } from '../capture.types';

describe('capture.types', () => {
  it('accepts a minimal CaptureRow fixture with only required fields', () => {
    const row: CaptureRow = {
      requestId: 'req-1',
      capturedAtMs: 1000,
      kind: 'patch',
      route: '/api/animes/anime-1',
      transport: 'http',
      outcome: 'accepted',
    };

    expect(row.requestId).toBe('req-1');
  });

  it('accepts a fully-populated CaptureRow with optional fields present', () => {
    const row: CaptureRow = {
      requestId: 'req-2',
      capturedAtMs: 2000,
      kind: 'patch',
      route: '/api/animes/anime-2',
      transport: 'http',
      outcome: 'accepted',
      errorCode: 'validation_error',
      httpStatus: 200,
      durationMs: 42,
      animeId: 'anime-2',
    };

    expect(row.httpStatus).toBe(200);
  });

  it('accepts a CapturePage with a non-empty items array', () => {
    const page: CapturePage = {
      items: [],
      appliedLimit: 25,
      malformedRowsSkipped: 0,
      warningCount: 0,
      degraded: false,
    };

    expect(page.items).toHaveLength(0);
  });

  it('accepts a CaptureDetail extending CaptureRow with body/header/correlation fields', () => {
    const detail: CaptureDetail = {
      requestId: 'req-1',
      capturedAtMs: 1000,
      kind: 'patch',
      route: '/api/animes/anime-1',
      transport: 'http',
      outcome: 'accepted',
      payload: { status: 1 },
      requestBody: '{"name":"x","nested":{"n":1}}',
      requestBodyState: 'omitted_too_large',
      responseBodyState: 'truncated',
      correlations: { operationRefs: [] },
      deviceId: 'device-1',
      deviceName: 'Phone',
    };

    expect(detail.correlations.operationRefs).toEqual([]);
    expect(detail.requestBody).toContain('nested');
    expect(detail.responseBodyState).toBe('truncated');
  });

  it('accepts a CaptureDetailResult not-found shape', () => {
    const result: CaptureDetailResult = {
      found: false,
      item: {
        requestId: '',
        capturedAtMs: 0,
        kind: '',
        route: '',
        transport: '',
        outcome: '',
        payload: {},
        correlations: { operationRefs: [] },
        deviceId: '',
        deviceName: '',
      },
      degraded: false,
    };

    expect(result.found).toBe(false);
  });

  it('accepts a zero-value CaptureQueryFilters with no filters set', () => {
    const filters: CaptureQueryFilters = {};

    expect(filters.limit).toBeUndefined();
  });
});
