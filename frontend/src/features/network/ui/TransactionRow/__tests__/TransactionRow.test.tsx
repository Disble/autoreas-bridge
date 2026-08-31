import { Table } from '@heroui/react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ELAPSED_CLOCK_TICK_MS } from '../../../../../shared/hooks/use-elapsed-clock/use-elapsed-clock.constants';
import { TRANSACTION_EMPTY_LABEL } from '../../TransactionPanel/transaction-panel.constants';
import type { TransactionRowViewModel } from '../../TransactionPanel/transaction-panel.types';
import { TransactionRow } from '../TransactionRow';

/**
 * Counts every call of the per-row clock hook. It is the observable proof that a
 * row body re-ran: `React.memo` skipping an unchanged row is invisible in the
 * DOM, and a test that only reads the rendered text cannot tell a skipped render
 * from an identical one.
 */
const { liveHookCalls } = vi.hoisted(() => ({ liveHookCalls: vi.fn() }));

vi.mock('../use-transaction-row-live', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../use-transaction-row-live')>();

  return {
    useTransactionRowLive: (capturedAtMs: number) => {
      liveHookCalls(capturedAtMs);

      return actual.useTransactionRowLive(capturedAtMs);
    },
  };
});

/** Builds one presentation-ready transaction row, overridable field by field per test. */
function row(overrides: Partial<TransactionRowViewModel> = {}): TransactionRowViewModel {
  return {
    id: 'req-1',
    methodKind: 'patch',
    route: '/api/animes/anime-1',
    outcome: 'accepted',
    outcomeColor: 'success',
    statusLabel: '200',
    statusColor: 'success',
    hasHttpStatus: true,
    durationLabel: '42ms',
    timeLabel: '10:30:45',
    arrivalCapturedAtMs: null,
    ...overrides,
  };
}

/** Builds one settled arrival row: the presentation a stranded request ends up with. */
function arrivalRow(capturedAtMs: number): TransactionRowViewModel {
  return row({
    id: 'req-live',
    outcome: 'abandoned',
    outcomeColor: 'warning',
    statusLabel: TRANSACTION_EMPTY_LABEL,
    statusColor: 'default',
    hasHttpStatus: false,
    durationLabel: TRANSACTION_EMPTY_LABEL,
    arrivalCapturedAtMs: capturedAtMs,
  });
}

/** Minimal HeroUI table shell, so a row can be mounted without the whole panel. */
function TableHarness({ rows }: Readonly<{ rows: readonly TransactionRowViewModel[] }>) {
  return (
    <Table aria-label="Captured transactions">
      <Table.Content aria-label="Captured transactions">
        <Table.Header>
          <Table.Column isRowHeader>Time</Table.Column>
          <Table.Column>Method</Table.Column>
          <Table.Column>Route</Table.Column>
          <Table.Column>Outcome</Table.Column>
          <Table.Column>Status</Table.Column>
          <Table.Column>Duration</Table.Column>
        </Table.Header>
        <Table.Body>
          {rows.map((item) => (
            <TransactionRow key={item.id} row={item} />
          ))}
        </Table.Body>
      </Table.Content>
    </Table>
  );
}

describe('TransactionRow', () => {
  beforeEach(() => {
    liveHookCalls.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders a terminal row entirely from its settled view model, with no clock at all', () => {
    render(<TableHarness rows={[row()]} />);

    expect(screen.getByText('/api/animes/anime-1')).toBeInTheDocument();
    expect(screen.getByText('42ms')).toBeInTheDocument();
    expect(screen.getByText('accepted')).toBeInTheDocument();
    expect(liveHookCalls).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('renders a genuinely in-flight arrival row as pending with a live elapsed duration that advances', () => {
    render(<TableHarness rows={[arrivalRow(Date.now())]} />);

    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.getByText('0ms')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(ELAPSED_CLOCK_TICK_MS);
    });

    expect(screen.getByText('500ms')).toBeInTheDocument();
  });

  it('stops its clock once the row transitions to a terminal outcome', () => {
    const capturedAtMs = Date.now();
    const { rerender } = render(<TableHarness rows={[arrivalRow(capturedAtMs)]} />);

    expect(vi.getTimerCount()).toBeGreaterThan(0);

    rerender(<TableHarness rows={[row({ id: 'req-live', durationLabel: '86ms' })]} />);

    expect(screen.getByText('86ms')).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('skips re-render work for a row whose view model has not changed', () => {
    const viewModel = arrivalRow(Date.now());
    const { rerender } = render(<TableHarness rows={[viewModel]} />);
    const callsAfterMount = liveHookCalls.mock.calls.length;

    rerender(<TableHarness rows={[viewModel]} />);

    expect(liveHookCalls.mock.calls.length).toBe(callsAfterMount);
  });

  it('re-renders a row whose view model actually changed', () => {
    const capturedAtMs = Date.now();
    const { rerender } = render(<TableHarness rows={[arrivalRow(capturedAtMs)]} />);
    const callsAfterMount = liveHookCalls.mock.calls.length;

    rerender(<TableHarness rows={[arrivalRow(capturedAtMs)]} />);

    expect(liveHookCalls.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });
});
