import { describe, expect, it } from 'vitest';
import type { CaptureDetail } from '../../../../../shared/contracts/capture.types';
import {
  TRANSACTION_DIAGNOSTICS_NO_REPORT_NOTICE,
  TRANSACTION_PAYLOAD_NOT_CAPTURED_NOTICE,
  TRANSACTION_REQUEST_BODY_OMITTED_STREAMING_NOTICE,
  TRANSACTION_REQUEST_BODY_OMITTED_TOO_LARGE_NOTICE,
} from '../../TransactionPanel/transaction-panel.constants';
import {
  TRANSACTION_DIAGNOSTICS_PREVIOUS_CYCLE_NONE,
  TRANSACTION_DIAGNOSTICS_UNPARSEABLE_BODY_NOTICE,
} from '../transaction-diagnostics.constants';
import type { TransactionDiagnosticsReportViewModel } from '../transaction-diagnostics.types';
import { toDiagnosticsReport } from '../transaction-diagnostics.helpers';

/**
 * A full, valid POST /api/sync/diagnostics body as mobile emits it: every
 * projected field present, including a non-null previous_cycle with an error.
 */
const FULL_REPORT_BODY = JSON.stringify({
  cycle_id: 'cyc-123',
  degraded: null,
  trigger_source: 'background_sync',
  app_state: 'foreground',
  previous_cycle: {
    outcome: 'failed',
    elapsed_ms: 15230,
    error_name: 'network_timeout',
    error_fingerprint: '1a2b3c4d',
  },
  counters: {
    consecutive_unclosed_cycles: 2,
    pending_ops_count: 7,
    cursor: 41,
  },
});

/** Builds one diagnostics-route capture detail carrying the given body/state. */
function diagnosticsDetail(overrides: Partial<CaptureDetail> = {}): CaptureDetail {
  return {
    requestId: 'req-diag',
    capturedAtMs: 1000,
    kind: 'post',
    route: '/api/sync/diagnostics',
    transport: 'http',
    outcome: 'accepted',
    httpStatus: 204,
    durationMs: 5,
    payload: {},
    correlations: { operationRefs: [] },
    deviceId: '',
    deviceName: '',
    requestBody: FULL_REPORT_BODY,
    ...overrides,
  };
}

/** One projection table row: a captured body and the exact view-model it must project to. */
interface ProjectionCase {
  /** Row name shown by the Vitest runner. */
  readonly name: string;
  /** The captured request body; `undefined` when the capture records none. */
  readonly body: string | undefined;
  /** The exact view-model the projection must produce for this body. */
  readonly expected: TransactionDiagnosticsReportViewModel;
}

/**
 * Body shapes over one act and one assert: every valid shape is projected
 * row for row, and every invalid shape (missing members, wrong-typed
 * members, non-object containers, non-object bodies) yields absence — never
 * a coerced zero, an empty string, or an undefined-valued row.
 */
const PROJECTION_CASES: readonly ProjectionCase[] = [
  {
    name: 'projects a full payload into the expected labelled values',
    body: FULL_REPORT_BODY,
    expected: {
      kind: 'report',
      rows: [
        { label: 'cycle_id', value: 'cyc-123' },
        { label: 'trigger_source', value: 'background_sync' },
        { label: 'cursor', value: '41' },
        { label: 'consecutive_unclosed_cycles', value: '2' },
        { label: 'pending_ops_count', value: '7' },
        { label: 'previous_cycle.outcome', value: 'failed' },
        { label: 'previous_cycle.elapsed_ms', value: '15230ms' },
        { label: 'previous_cycle.error_fingerprint', value: '1a2b3c4d' },
        { label: 'previous_cycle.error_name', value: 'network_timeout' },
      ],
    },
  },
  {
    name: 'renders a null previous_cycle as an explicit none-recorded row, never zeros',
    body: JSON.stringify({
      cycle_id: 'cyc-9',
      trigger_source: 'manual',
      previous_cycle: null,
      counters: { consecutive_unclosed_cycles: 0, pending_ops_count: 0, cursor: 0 },
    }),
    expected: {
      kind: 'report',
      rows: [
        { label: 'cycle_id', value: 'cyc-9' },
        { label: 'trigger_source', value: 'manual' },
        { label: 'cursor', value: '0' },
        { label: 'consecutive_unclosed_cycles', value: '0' },
        { label: 'pending_ops_count', value: '0' },
        { label: 'previous_cycle', value: TRANSACTION_DIAGNOSTICS_PREVIOUS_CYCLE_NONE },
      ],
    },
  },
  {
    name: 'leaves every member of an empty body absent',
    body: '{}',
    expected: { kind: 'report', rows: [] },
  },
  {
    name: 'treats a null counters container as absent, not zero',
    body: JSON.stringify({ counters: null }),
    expected: { kind: 'report', rows: [] },
  },
  {
    name: 'treats an array counters container as absent',
    body: JSON.stringify({ counters: [1, 2] }),
    expected: { kind: 'report', rows: [] },
  },
  {
    name: 'leaves a non-finite cursor absent',
    body: '{"counters":{"cursor":1e999}}',
    expected: { kind: 'report', rows: [] },
  },
  {
    name: 'leaves a string field holding a non-string absent',
    body: JSON.stringify({ cycle_id: 42, trigger_source: null }),
    expected: { kind: 'report', rows: [] },
  },
  {
    name: 'leaves a previous_cycle member holding a non-number absent',
    body: JSON.stringify({ previous_cycle: { outcome: 'failed', elapsed_ms: '15230' } }),
    expected: {
      kind: 'report',
      rows: [{ label: 'previous_cycle.outcome', value: 'failed' }],
    },
  },
  {
    name: 'leaves a previous_cycle member absent from the object absent',
    body: JSON.stringify({ previous_cycle: { elapsed_ms: 100 } }),
    expected: {
      kind: 'report',
      rows: [{ label: 'previous_cycle.elapsed_ms', value: '100ms' }],
    },
  },
  {
    name: 'leaves absent counters members absent while rendering the present one',
    body: JSON.stringify({ counters: { cursor: 3 } }),
    expected: { kind: 'report', rows: [{ label: 'cursor', value: '3' }] },
  },
  {
    name: 'leaves the cursor absent when the counters container does not carry it',
    body: JSON.stringify({ counters: { consecutive_unclosed_cycles: 1 } }),
    expected: { kind: 'report', rows: [{ label: 'consecutive_unclosed_cycles', value: '1' }] },
  },
  {
    name: 'yields the unparseable-body notice for a captured body that is not valid JSON',
    body: 'not-json-at-all',
    expected: { kind: 'no-report', notice: TRANSACTION_DIAGNOSTICS_UNPARSEABLE_BODY_NOTICE },
  },
  {
    name: 'yields the no-report notice for a captured body that parses to a non-object JSON value',
    body: '42',
    expected: { kind: 'no-report', notice: TRANSACTION_DIAGNOSTICS_NO_REPORT_NOTICE },
  },
  {
    name: 'yields the no-report notice for a captured body that parses to JSON null',
    body: 'null',
    expected: { kind: 'no-report', notice: TRANSACTION_DIAGNOSTICS_NO_REPORT_NOTICE },
  },
];

/** One body-state skip table row: capture overrides and the notice they must yield. */
interface SkipCase {
  /** Row name shown by the Vitest runner. */
  readonly name: string;
  /** Capture overrides producing the skipped or absent body. */
  readonly overrides: Partial<CaptureDetail>;
  /** The exact notice the projection must carry. */
  readonly notice: string;
}

/**
 * Body states that must yield the no-report outcome with the already-declared
 * wording before anything is parsed: the body-state guard wins over a present
 * body string, and a capture with no body at all is stated, not blanked.
 */
const SKIP_CASES: readonly SkipCase[] = [
  {
    name: 'a body skipped as too large yields the existing too-large wording',
    overrides: { requestBody: undefined, requestBodyState: 'omitted_too_large' },
    notice: TRANSACTION_REQUEST_BODY_OMITTED_TOO_LARGE_NOTICE,
  },
  {
    name: 'a body of unknown length yields the existing streaming wording even beside a present body',
    overrides: { requestBodyState: 'omitted_streaming' },
    notice: TRANSACTION_REQUEST_BODY_OMITTED_STREAMING_NOTICE,
  },
  {
    name: 'a capture without a body yields the existing not-captured wording',
    overrides: { requestBody: undefined },
    notice: TRANSACTION_PAYLOAD_NOT_CAPTURED_NOTICE,
  },
  {
    name: 'an empty captured body yields the existing not-captured wording',
    overrides: { requestBody: '' },
    notice: TRANSACTION_PAYLOAD_NOT_CAPTURED_NOTICE,
  },
];

describe('toDiagnosticsReport', () => {
  it.each(PROJECTION_CASES)('$name', ({ body, expected }) => {
    expect(toDiagnosticsReport(diagnosticsDetail({ requestBody: body }))).toEqual(expected);
  });

  it.each(SKIP_CASES)('$name', ({ overrides, notice }) => {
    expect(toDiagnosticsReport(diagnosticsDetail(overrides))).toEqual({ kind: 'no-report', notice });
  });

  it('projects nothing for a capture on any other route', () => {
    expect(toDiagnosticsReport(diagnosticsDetail({ route: '/api/animes/anime-1' }))).toBeNull();
  });
});
