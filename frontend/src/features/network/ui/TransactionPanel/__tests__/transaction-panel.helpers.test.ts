import { describe, expect, it } from 'vitest';
import type { CaptureDetail, CaptureRow } from '../../../../../shared/contracts/capture.types';
import { TRANSACTION_EMPTY_LABEL, TRANSACTION_NOT_CAPTURED_LABEL } from '../transaction-panel.constants';
import { getTransactionStatusColor, toTransactionDetail, toTransactionRow } from '../transaction-panel.helpers';

function row(overrides: Partial<CaptureRow> = {}): CaptureRow {
  return {
    requestId: 'req-1',
    capturedAtMs: Date.UTC(2026, 5, 20, 10, 30, 45),
    kind: 'patch',
    route: '/api/animes/anime-1',
    transport: 'http',
    outcome: 'accepted',
    ...overrides,
  };
}

function detail(overrides: Partial<CaptureDetail> = {}): CaptureDetail {
  return {
    ...row(),
    payload: { status: 1 },
    correlations: { operationRefs: [] },
    deviceId: 'device-1',
    deviceName: 'Phone',
    ...overrides,
  };
}

describe('getTransactionStatusColor', () => {
  it('maps 2xx to success', () => {
    expect(getTransactionStatusColor(204)).toBe('success');
  });

  it('maps 3xx to default', () => {
    expect(getTransactionStatusColor(304)).toBe('default');
  });

  it('maps 4xx to warning', () => {
    expect(getTransactionStatusColor(404)).toBe('warning');
  });

  it('maps 5xx to danger', () => {
    expect(getTransactionStatusColor(503)).toBe('danger');
  });

  it('maps an absent status to default', () => {
    expect(getTransactionStatusColor(undefined)).toBe('default');
  });
});

describe('toTransactionRow', () => {
  it('maps kind, route, outcome, status, and duration', () => {
    const viewModel = toTransactionRow(row({ httpStatus: 200, durationMs: 42 }));

    expect(viewModel.methodKind).toBe('patch');
    expect(viewModel.route).toBe('/api/animes/anime-1');
    expect(viewModel.outcome).toBe('accepted');
    expect(viewModel.statusLabel).toBe('200');
    expect(viewModel.statusColor).toBe('success');
    expect(viewModel.durationLabel).toBe('42ms');
  });

  it('falls back to the empty label when httpStatus/durationMs are absent', () => {
    const viewModel = toTransactionRow(row({ httpStatus: undefined, durationMs: undefined }));

    expect(viewModel.statusLabel).toBe(TRANSACTION_EMPTY_LABEL);
    expect(viewModel.durationLabel).toBe(TRANSACTION_EMPTY_LABEL);
    expect(viewModel.statusColor).toBe('default');
  });

  it('carries the requestId as the row id', () => {
    expect(toTransactionRow(row({ requestId: 'req-9' })).id).toBe('req-9');
  });

  it('marks a pending row as pending and shows a live-ticking elapsed duration instead of the empty label', () => {
    const viewModel = toTransactionRow(row({ outcome: 'pending', capturedAtMs: 1000, durationMs: undefined }), 1750);

    expect(viewModel.isPending).toBe(true);
    expect(viewModel.durationLabel).toBe('750ms');
  });

  it('marks a terminal row as not pending', () => {
    const viewModel = toTransactionRow(row({ outcome: 'accepted', durationMs: 42 }));

    expect(viewModel.isPending).toBe(false);
    expect(viewModel.durationLabel).toBe('42ms');
  });
});

describe('toTransactionDetail', () => {
  it('builds general fields, headers, response body, and correlations', () => {
    const viewModel = toTransactionDetail(
      detail({
        httpStatus: 200,
        requestHeaders: { 'content-type': 'application/json' },
        responseHeaders: { 'x-request-id': 'req-1' },
        responseBody: '{"ok":true}',
        correlations: { operationRefs: [{ animeId: 'anime-1', operation: 'patch', outcome: 'accepted' }] },
      }),
    );

    expect(viewModel.requestId).toBe('req-1');
    expect(viewModel.requestHeaders).toEqual([{ label: 'content-type', value: 'application/json' }]);
    expect(viewModel.responseHeaders).toEqual([{ label: 'x-request-id', value: 'req-1' }]);
    expect(viewModel.responseBody).toBe('{"ok":true}');
    expect(viewModel.correlations).toEqual([{ label: 'anime-1 · patch', value: 'accepted' }]);
    expect(viewModel.requestPayload).toContain('"status": 1');
  });

  it('falls back to "Not captured" for absent response body and empty headers/correlations', () => {
    const viewModel = toTransactionDetail(detail({ responseBody: undefined, requestHeaders: undefined, responseHeaders: undefined }));

    expect(viewModel.responseBody).toBe(TRANSACTION_NOT_CAPTURED_LABEL);
    expect(viewModel.requestHeaders).toEqual([]);
    expect(viewModel.responseHeaders).toEqual([]);
    expect(viewModel.correlations).toEqual([]);
  });
});
