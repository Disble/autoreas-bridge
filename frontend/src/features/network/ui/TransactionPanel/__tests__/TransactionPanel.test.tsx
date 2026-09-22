import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptureTransactionSource } from '../../../../../infrastructure/capture-transaction-source/capture-transaction-source.types';
import type { CaptureDetail, CaptureRow } from '../../../../../shared/contracts/capture.types';
import {
  TRANSACTION_FILTER_DEBOUNCE_MS,
  TRANSACTION_LOADING_STATE_MESSAGE,
  TRANSACTION_TABLE_SKELETON_ROW_COUNT,
  TRANSACTION_UPDATING_STATE_MESSAGE,
} from '../transaction-panel.constants';
import { resetTransactionStore } from '../../../../../shared/store/transaction-store/transaction-store.helpers';
import { TransactionPanel } from '../TransactionPanel';

/** Builds one capture row, overridable field by field per test. */
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

/** Builds one capture-detail envelope on top of the base row. */
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

/** Builds a fake transaction source resolving an empty page, overridable per test. */
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
    summarizeTransactions: vi.fn().mockResolvedValue({ groups: [], degraded: false }),
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

/**
 * The settled-filter contract at the panel boundary: while a settled query is
 * in flight the rail keeps its previous rows with the discreet updating hint,
 * and the skeleton appears only on a first load, when there is nothing to
 * show yet.
 */
describe('TransactionPanel — settled filter loading states', () => {
  afterEach(() => {
    cleanup();
    resetTransactionStore();
    vi.useRealTimers();
  });

  /** Builds a page envelope around one row, as ListCaptureTransactions returns it. */
  function pageWithRow(): { items: readonly CaptureRow[]; appliedLimit: number; malformedRowsSkipped: number; warningCount: number; degraded: boolean } {
    return { items: [row()], appliedLimit: 25, malformedRowsSkipped: 0, warningCount: 0, degraded: false };
  }

  it('keeps the previous rows on screen with the updating hint while a settled filter query is in flight', async () => {
    vi.useFakeTimers();
    const listTransactions = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(pageWithRow()))
      .mockImplementation(() => new Promise<never>(() => undefined));
    const { container } = render(<TransactionPanel source={createFakeSource({ listTransactions })} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('/api/animes/anime-1')).toBeInTheDocument();
    expect(screen.queryByText(TRANSACTION_UPDATING_STATE_MESSAGE)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Route'), { target: { value: '/api/sync' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TRANSACTION_FILTER_DEBOUNCE_MS);
    });
    // Exactly one settled query ran after the pause.
    expect(listTransactions).toHaveBeenCalledTimes(2);

    // The rows stay mounted; nothing swaps them for skeletons.
    expect(screen.getByText('/api/animes/anime-1')).toBeInTheDocument();
    expect(screen.queryAllByTestId('transaction-table-skeleton-row')).toHaveLength(0);

    // The table is busy and announces it, and the hint sits in the status line.
    expect(container.querySelector('[data-transaction-scroll] [aria-busy="true"]')).not.toBeNull();
    expect(screen.getByRole('status', { name: TRANSACTION_UPDATING_STATE_MESSAGE })).toBeInTheDocument();
    const statusLine = screen.getByText(/Showing 25 captured transactions per page/);
    expect(statusLine).toHaveTextContent(TRANSACTION_UPDATING_STATE_MESSAGE);
  });

  it('still shows the placeholder table with the announcement on a first load, when there is nothing to show yet', async () => {
    vi.useFakeTimers();
    const listTransactions = vi.fn().mockImplementation(() => new Promise<never>(() => undefined));
    const { container } = render(<TransactionPanel source={createFakeSource({ listTransactions })} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getAllByTestId('transaction-table-skeleton-row')).toHaveLength(TRANSACTION_TABLE_SKELETON_ROW_COUNT);
    expect(screen.getByRole('status', { name: TRANSACTION_LOADING_STATE_MESSAGE })).toBeInTheDocument();
    expect(container.querySelector('[data-transaction-scroll] [aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText(TRANSACTION_UPDATING_STATE_MESSAGE)).not.toBeInTheDocument();
  });
});
