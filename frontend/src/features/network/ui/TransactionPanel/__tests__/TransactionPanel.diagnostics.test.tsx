import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureDetail } from '../../../../../shared/contracts/capture.types';
import type { CaptureTransactionSource } from '../../../../../infrastructure/capture-transaction-source/capture-transaction-source.types';
import { resetTransactionStore } from '../../../../../shared/store/transaction-store/transaction-store.helpers';
import { TRANSACTION_EMPTY_LABEL } from '../transaction-panel.constants';
import type { TransactionDetailFieldRow } from '../transaction-panel.types';
import { toTransactionDetail } from '../transaction-panel.helpers';
import { TransactionPanel } from '../TransactionPanel';

/** Builds a fake transaction source resolving an empty page, overridable per test. */
function createFakeSource(): CaptureTransactionSource {
  return {
    listTransactions: vi.fn().mockResolvedValue({
      items: [],
      appliedLimit: 25,
      malformedRowsSkipped: 0,
      warningCount: 0,
      degraded: false,
    }),
    getTransaction: vi.fn().mockResolvedValue({ found: false, item: null, degraded: false }),
    summarizeTransactions: vi.fn().mockResolvedValue({ groups: [], degraded: false }),
  };
}

/** Builds one capture detail for the General tab's field-row projection, overridable per row. */
function captureDetail(overrides: Partial<CaptureDetail> = {}): CaptureDetail {
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
    ...overrides,
  };
}

/** One general-fields table row: capture overrides and the exact field rows they must project. */
interface GeneralFieldsCase {
  /** Row name shown by the Vitest runner. */
  readonly name: string;
  /** Capture overrides distinguishing the device/errorCode shapes under test. */
  readonly overrides: Partial<CaptureDetail>;
  /** The exact General tab field rows the projection must produce. */
  readonly fields: readonly TransactionDetailFieldRow[];
}

/**
 * General tab shapes over one act and one assert: a capture that recorded a
 * device carries the deviceName row, a deviceless capture omits the row
 * entirely (never a blank attribution), and an absent or empty errorCode is
 * stated with the Null Object label while a present one is carried verbatim.
 */
const GENERAL_FIELDS_CASES: readonly GeneralFieldsCase[] = [
  {
    name: 'carries the deviceName row for a capture that recorded a device, and the absent errorCode as the empty label',
    overrides: { deviceName: 'Pixel 8' },
    fields: [
      { label: 'requestId', value: 'req-diag' },
      { label: 'transport', value: 'http' },
      { label: 'deviceName', value: 'Pixel 8' },
      { label: 'errorCode', value: TRANSACTION_EMPTY_LABEL },
    ],
  },
  {
    name: 'omits the deviceName row entirely for a deviceless capture',
    overrides: { errorCode: '' },
    fields: [
      { label: 'requestId', value: 'req-diag' },
      { label: 'transport', value: 'http' },
      { label: 'errorCode', value: TRANSACTION_EMPTY_LABEL },
    ],
  },
  {
    name: 'carries a present errorCode verbatim',
    overrides: { deviceName: 'Pixel 8', errorCode: 'SYNC_DB_BUSY' },
    fields: [
      { label: 'requestId', value: 'req-diag' },
      { label: 'transport', value: 'http' },
      { label: 'deviceName', value: 'Pixel 8' },
      { label: 'errorCode', value: 'SYNC_DB_BUSY' },
    ],
  },
];

describe('toTransactionDetail general fields', () => {
  it.each(GENERAL_FIELDS_CASES)('$name', ({ overrides, fields }) => {
    expect(toTransactionDetail(captureDetail(overrides)).generalFields).toEqual(fields);
  });
});

describe('TransactionPanel diagnostics filter preset', () => {
  afterEach(() => {
    cleanup();
    resetTransactionStore();
  });

  it('applies the diagnostics route through the backend filter path when activated', async () => {
    const source = createFakeSource();
    render(<TransactionPanel source={source} />);

    const preset = await screen.findByRole('button', { name: 'Sync diagnostics reports' });
    preset.click();

    await waitFor(() => {
      expect(source.listTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ route: '/api/sync/diagnostics' }));
    });
  });
});
