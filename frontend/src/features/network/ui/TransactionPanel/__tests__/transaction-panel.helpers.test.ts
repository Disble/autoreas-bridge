import { describe, expect, it } from 'vitest';
import type { CaptureDetail, CaptureRow } from '../../../../../shared/contracts/capture.types';
import { TRANSACTION_STALE_PENDING_THRESHOLD_MS } from '../../../../../shared/store/transaction-store/transaction-store.constants';
import {
  TRANSACTION_EMPTY_LABEL,
  TRANSACTION_REQUEST_BODY_OMITTED_TOO_LARGE_NOTICE,
  TRANSACTION_RESPONSE_BODY_TRUNCATED_NOTICE,
} from '../transaction-panel.constants';
import {
  getTransactionOutcomeColor,
  getTransactionStatusColor,
  hasMoreTransactions,
  toStatusFilter,
  toStatusFilterInput,
  toTransactionBody,
  toTransactionDetail,
  toTransactionRow,
} from '../transaction-panel.helpers';

/** Builds one capture row, overridable field by field per test. */
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

/** Builds one capture-detail envelope on top of the base row. */
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

  it('maps 4xx to danger', () => {
    expect(getTransactionStatusColor(404)).toBe('danger');
  });

  it('maps 5xx to danger', () => {
    expect(getTransactionStatusColor(503)).toBe('danger');
  });

  it('maps an out-of-range status class to default without throwing', () => {
    expect(getTransactionStatusColor(100)).toBe('default');
    expect(getTransactionStatusColor(999)).toBe('default');
  });

  it('maps an absent status to default', () => {
    expect(getTransactionStatusColor(undefined)).toBe('default');
  });
});

describe('getTransactionOutcomeColor', () => {
  it('maps accepted and pushed to success', () => {
    expect(getTransactionOutcomeColor('accepted')).toBe('success');
    expect(getTransactionOutcomeColor('pushed')).toBe('success');
  });

  it('maps rejected to danger', () => {
    expect(getTransactionOutcomeColor('rejected')).toBe('danger');
  });

  it('maps malformed to warning, distinct from rejected', () => {
    expect(getTransactionOutcomeColor('malformed')).toBe('warning');
    expect(getTransactionOutcomeColor('malformed')).not.toBe(getTransactionOutcomeColor('rejected'));
  });

  it('maps pending and opened to accent', () => {
    expect(getTransactionOutcomeColor('pending')).toBe('accent');
    expect(getTransactionOutcomeColor('opened')).toBe('accent');
  });

  it('maps closed to default', () => {
    expect(getTransactionOutcomeColor('closed')).toBe('default');
  });

  it('maps an unknown outcome to default without throwing', () => {
    expect(() => getTransactionOutcomeColor('quarantined')).not.toThrow();
    expect(getTransactionOutcomeColor('quarantined')).toBe('default');
  });
});

describe('toTransactionBody', () => {
  it('renders a captured response body verbatim', () => {
    const viewModel = toTransactionBody({ kind: 'response', raw: '{"ok":true}' });

    expect(viewModel).toEqual({ state: 'captured', raw: '{"ok":true}' });
  });

  it('marks an absent response body as not-captured with the expected-for-2xx notice', () => {
    const viewModel = toTransactionBody({ kind: 'response', raw: undefined });

    expect(viewModel.state).toBe('not-captured');
    expect(viewModel.raw).toBe('');
    expect(viewModel.notice).toBeTruthy();
  });

  it('renders an explicit truncated response-body notice instead of pretending the captured prefix is exact', () => {
    const viewModel = toTransactionBody({ kind: 'response', raw: '{"prefix":true}', captureState: 'truncated' });

    expect(viewModel.state).toBe('redacted');
    expect(viewModel.notice).toBe(TRANSACTION_RESPONSE_BODY_TRUNCATED_NOTICE);
  });

  it('marks an absent request body as not-captured with a no-request-body notice', () => {
    const viewModel = toTransactionBody({ kind: 'request', raw: undefined });

    expect(viewModel.state).toBe('not-captured');
    expect(viewModel.notice).toBeTruthy();
  });

  it('renders a populated raw request body exactly as captured', () => {
    const requestBody = '{"name":"x","nested":{"n":1},"secret":"keep-me"}';
    const viewModel = toTransactionBody({ kind: 'request', raw: requestBody });

    expect(viewModel).toEqual({ state: 'captured', raw: requestBody });
  });

  it('renders an explicit oversized-request notice when the backend omitted pre-auth body capture', () => {
    const viewModel = toTransactionBody({ kind: 'request', raw: undefined, captureState: 'omitted_too_large' });

    expect(viewModel.state).toBe('redacted');
    expect(viewModel.notice).toBe(TRANSACTION_REQUEST_BODY_OMITTED_TOO_LARGE_NOTICE);
  });
});

describe('toTransactionRow / toTransactionDetail — hasHttpStatus and outcomeColor', () => {
  it('reports hasHttpStatus true when httpStatus is present', () => {
    expect(toTransactionRow(row({ httpStatus: 200 })).hasHttpStatus).toBe(true);
  });

  it('reports hasHttpStatus false for a pending row with no httpStatus', () => {
    expect(toTransactionRow(row({ outcome: 'pending', httpStatus: undefined })).hasHttpStatus).toBe(false);
  });

  it('reports hasHttpStatus false for a ws_broadcast/pushed row with no httpStatus', () => {
    expect(toTransactionRow(row({ kind: 'ws_broadcast', outcome: 'pushed', httpStatus: undefined })).hasHttpStatus).toBe(false);
  });

  it('carries outcomeColor on every row', () => {
    expect(toTransactionRow(row({ outcome: 'rejected' })).outcomeColor).toBe('danger');
  });

  it('resolves the same statusColor/outcomeColor for the table row and the detail of the same transaction', () => {
    const captureRow = row({ outcome: 'rejected', httpStatus: 404 });
    const captureDetail = detail({ outcome: 'rejected', httpStatus: 404 });

    const rowViewModel = toTransactionRow(captureRow);
    const detailViewModel = toTransactionDetail(captureDetail);

    expect(detailViewModel.statusColor).toBe(rowViewModel.statusColor);
    expect(detailViewModel.outcomeColor).toBe(rowViewModel.outcomeColor);
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

  it('marks a genuinely in-flight row as pending and shows a live-ticking elapsed duration instead of the empty label', () => {
    const viewModel = toTransactionRow(row({ outcome: 'pending', capturedAtMs: 1000, durationMs: undefined, httpStatus: undefined }), 1750);

    expect(viewModel.isPending).toBe(true);
    expect(viewModel.durationLabel).toBe('750ms');
  });

  it('treats a pending+200 row with a persisted duration as terminal, preserving the stored duration instead of using live elapsed time', () => {
    const viewModel = toTransactionRow(row({ outcome: 'pending', httpStatus: 200, durationMs: 86, capturedAtMs: 1000 }), 5000000);

    expect(viewModel.isPending).toBe(false);
    expect(viewModel.outcome).toBe('completed');
    expect(viewModel.durationLabel).toBe('86ms');
  });

  it('treats a terminal 404 as completed and stops the live duration ticker', () => {
    const viewModel = toTransactionRow(row({ outcome: 'pending', httpStatus: 404, durationMs: 69, capturedAtMs: 1000 }), 5000000);

    expect(viewModel.isPending).toBe(false);
    expect(viewModel.outcome).toBe('completed');
    expect(viewModel.durationLabel).toBe('69ms');
  });

  it('marks a terminal row as not pending', () => {
    const viewModel = toTransactionRow(row({ outcome: 'accepted', durationMs: 42 }));

    expect(viewModel.isPending).toBe(false);
    expect(viewModel.durationLabel).toBe('42ms');
  });
});

describe('formatTransactionDuration — human-readable units', () => {
  it('keeps sub-second durations in raw milliseconds', () => {
    expect(toTransactionRow(row({ outcome: 'accepted', durationMs: 999 })).durationLabel).toBe('999ms');
  });

  it('formats a multi-second duration in seconds', () => {
    expect(toTransactionRow(row({ outcome: 'accepted', durationMs: 52628 })).durationLabel).toBe('52.6s');
  });

  it('formats a multi-minute duration in minutes and seconds', () => {
    expect(toTransactionRow(row({ outcome: 'accepted', durationMs: 125000 })).durationLabel).toBe('2m 5s');
  });

  it('formats a multi-hour duration in hours and minutes instead of an unreadable millisecond count', () => {
    expect(toTransactionRow(row({ outcome: 'accepted', durationMs: 49412953 })).durationLabel).toBe('13h 43m');
  });
});

describe('toTransactionRow — stale pending rows', () => {
  const capturedAtMs = 1_000_000;

  it('keeps ticking for a pending row inside the staleness window', () => {
    const viewModel = toTransactionRow(
      row({ outcome: 'pending', capturedAtMs, durationMs: undefined, httpStatus: undefined }),
      capturedAtMs + TRANSACTION_STALE_PENDING_THRESHOLD_MS - 1,
    );

    expect(viewModel.isPending).toBe(true);
  });

  it('stops the ticker and reports a pending row past the staleness window as abandoned', () => {
    const viewModel = toTransactionRow(
      row({ outcome: 'pending', capturedAtMs, durationMs: undefined, httpStatus: undefined }),
      capturedAtMs + TRANSACTION_STALE_PENDING_THRESHOLD_MS,
    );

    expect(viewModel.isPending).toBe(false);
    expect(viewModel.outcome).toBe('abandoned');
    expect(viewModel.durationLabel).toBe(TRANSACTION_EMPTY_LABEL);
  });

  it('colors an abandoned row as a warning rather than a neutral default', () => {
    expect(getTransactionOutcomeColor('abandoned')).toBe('warning');
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
        responseBodyState: 'truncated',
        correlations: { operationRefs: [{ animeId: 'anime-1', operation: 'patch', outcome: 'accepted' }] },
      }),
    );

    expect(viewModel.requestId).toBe('req-1');
    expect(viewModel.requestHeaders).toEqual([{ label: 'content-type', value: 'application/json' }]);
    expect(viewModel.responseHeaders).toEqual([{ label: 'x-request-id', value: 'req-1' }]);
    expect(viewModel.responseBody).toEqual({ state: 'redacted', raw: '{"ok":true}', notice: TRANSACTION_RESPONSE_BODY_TRUNCATED_NOTICE });
    expect(viewModel.correlations).toEqual([{ label: 'anime-1 · patch', value: 'accepted' }]);
    expect(viewModel.requestPayload).toEqual({ state: 'not-captured', raw: '', notice: 'This request did not include a body.' });
  });

  it('prefers an exact raw request body over the semantic payload map when present', () => {
    const requestBody = '{"name":"x","nested":{"n":1},"secret":"keep-me"}';
    const viewModel = toTransactionDetail(detail({ requestBody, payload: { status: 1 } }));

    expect(viewModel.requestPayload).toEqual({ state: 'captured', raw: requestBody });
  });

  it('surfaces an explicit omitted-too-large request-body state in the detail inspector', () => {
    const viewModel = toTransactionDetail(detail({ requestBody: undefined, requestBodyState: 'omitted_too_large' }));

    expect(viewModel.requestPayload).toEqual({ state: 'redacted', raw: '', notice: TRANSACTION_REQUEST_BODY_OMITTED_TOO_LARGE_NOTICE });
  });

  it('falls back to explicit not-captured bodies for an absent response body and empty headers/correlations', () => {
    const viewModel = toTransactionDetail(detail({ responseBody: undefined, requestHeaders: undefined, responseHeaders: undefined }));

    expect(viewModel.responseBody.state).toBe('not-captured');
    expect(viewModel.requestHeaders).toEqual([]);
    expect(viewModel.responseHeaders).toEqual([]);
    expect(viewModel.correlations).toEqual([]);
  });
});

describe('toStatusFilter', () => {
  it('parses a typed status code into the exact status the backend filters on', () => {
    expect(toStatusFilter('404')).toBe(404);
  });

  it('returns null for an empty input, so no http_status predicate is sent at all', () => {
    // This is the case that keeps websocket captures visible: 537 of 1,317
    // stored rows (measured 2026-08-30) carry a NULL http_status, and an
    // explicit status predicate excludes every one of them.
    expect(toStatusFilter('')).toBeNull();
  });

  it('returns null when nothing numeric was typed rather than guessing a status', () => {
    expect(toStatusFilter('abc')).toBeNull();
  });

  it('keeps the digits out of a mixed input instead of swallowing the keystroke', () => {
    expect(toStatusFilter('4o4')).toBe(44);
  });
});

describe('toStatusFilterInput', () => {
  it('renders an active status filter back into the input', () => {
    expect(toStatusFilterInput(404)).toBe('404');
  });

  it('renders an unset filter as an empty box rather than a fabricated 0', () => {
    expect(toStatusFilterInput(null)).toBe('');
  });
});

describe('hasMoreTransactions', () => {
  it('offers more while the backend still returned a continuation cursor', () => {
    expect(hasMoreTransactions('cursor-1', 60, 60)).toBe(true);
  });

  it('offers more while loaded rows are still hidden, even with no cursor left', () => {
    expect(hasMoreTransactions(null, 25, 60)).toBe(true);
  });

  it('stops offering more once the cursor is exhausted and every loaded row is revealed', () => {
    expect(hasMoreTransactions(null, 60, 60)).toBe(false);
  });
});
