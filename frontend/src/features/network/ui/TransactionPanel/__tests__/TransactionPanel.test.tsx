import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureTransactionSource } from '../../../../../infrastructure/capture-transaction-source';
import type { CaptureDetail, CaptureRow } from '../../../../../shared/contracts/capture.types';
import { resetTransactionStore } from '../../../../../shared/store/transaction-store';
import { TransactionPanel } from '../TransactionPanel';

function row(overrides: Partial<CaptureRow> = {}): CaptureRow {
  return {
    requestId: 'req-1',
    capturedAtMs: 1000,
    kind: 'patch',
    route: '/api/animes/anime-1',
    transport: 'http',
    outcome: 'accepted',
    httpStatus: 200,
    durationMs: 42,
    ...overrides,
  };
}

function detail(overrides: Partial<CaptureDetail> = {}): CaptureDetail {
  return {
    ...row(),
    payload: {},
    correlations: { operationRefs: [] },
    deviceId: 'device-1',
    deviceName: 'Phone',
    ...overrides,
  };
}

function createFakeSource(overrides: Partial<CaptureTransactionSource> = {}): CaptureTransactionSource {
  return {
    listTransactions: vi.fn().mockResolvedValue({
      items: [],
      appliedLimit: 25,
      malformedRowsSkipped: 0,
      warningCount: 0,
      degraded: false,
    }),
    getTransaction: vi.fn().mockResolvedValue({ found: false, item: detail(), degraded: false }),
    ...overrides,
  };
}

describe('TransactionPanel', () => {
  afterEach(() => {
    cleanup();
    resetTransactionStore();
  });

  it('renders the empty state when there are no rows', async () => {
    render(<TransactionPanel source={createFakeSource()} />);

    expect(await screen.findByText('No captured transactions match the current filters.')).toBeInTheDocument();
  });

  it('renders a real status and duration per row', async () => {
    const source = createFakeSource({
      listTransactions: vi.fn().mockResolvedValue({
        items: [row()],
        appliedLimit: 25,
        malformedRowsSkipped: 0,
        warningCount: 0,
        degraded: false,
      }),
    });

    render(<TransactionPanel source={source} />);

    expect(await screen.findByText('/api/animes/anime-1')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('42ms')).toBeInTheDocument();
  });

  it('shows the detail after a row is clicked', async () => {
    const source = createFakeSource({
      listTransactions: vi.fn().mockResolvedValue({
        items: [row()],
        appliedLimit: 25,
        malformedRowsSkipped: 0,
        warningCount: 0,
        degraded: false,
      }),
      getTransaction: vi.fn().mockResolvedValue({ found: true, item: detail(), degraded: false }),
    });

    render(<TransactionPanel source={source} />);

    const cell = await screen.findByText('/api/animes/anime-1');
    cell.closest('tr')?.click();

    expect(await screen.findByRole('tab', { name: 'General' })).toBeInTheDocument();
  });

  it('shows a degraded warning when the source reports a degraded page', async () => {
    const source = createFakeSource({
      listTransactions: vi.fn().mockResolvedValue({
        items: [],
        appliedLimit: 25,
        malformedRowsSkipped: 0,
        warningCount: 0,
        degraded: true,
      }),
    });

    render(<TransactionPanel source={source} />);

    expect(
      await screen.findByText('Captured transaction data is temporarily unavailable. Showing whatever was already loaded.'),
    ).toBeInTheDocument();
  });
});
