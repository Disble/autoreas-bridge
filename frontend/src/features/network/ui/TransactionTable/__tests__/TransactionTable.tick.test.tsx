import { act, cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ELAPSED_CLOCK_TICK_MS } from '../../../../../shared/hooks/use-elapsed-clock/use-elapsed-clock.constants';
import { TRANSACTION_EMPTY_LABEL } from '../../TransactionPanel/transaction-panel.constants';
import type { TransactionRowProps, TransactionRowViewModel } from '../../TransactionPanel/transaction-panel.types';
import { TransactionTable } from '../TransactionTable';

/**
 * Render tally per row id, written by the counting passthrough the mock below
 * installs around the real row. The wrapper is deliberately NOT memoized: it
 * counts how many times the TABLE handed a row out, which is exactly what a
 * clock in the list-wide mapping used to inflate twice a second.
 */
const { rowRenders } = vi.hoisted(() => ({ rowRenders: new Map<string, number>() }));

vi.mock('../../TransactionRow/TransactionRow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../TransactionRow/TransactionRow')>();

  return {
    TransactionRow: function CountingTransactionRow(props: Readonly<TransactionRowProps>) {
      rowRenders.set(props.row.id, (rowRenders.get(props.row.id) ?? 0) + 1);

      return createElement(actual.TransactionRow, props);
    },
  };
});

/** Builds one terminal (settled) transaction row, overridable field by field per test. */
function terminalRow(id: string): TransactionRowViewModel {
  return {
    id,
    methodKind: 'patch',
    route: `/api/animes/${id}`,
    outcome: 'accepted',
    outcomeColor: 'success',
    statusLabel: '200',
    statusColor: 'success',
    hasHttpStatus: true,
    durationLabel: '42ms',
    timeLabel: '10:30:45',
    arrivalCapturedAtMs: null,
  };
}

/** Builds one transport-only arrival row: the single row that owns a clock. */
function arrivalRow(capturedAtMs: number): TransactionRowViewModel {
  return {
    ...terminalRow('req-live'),
    route: '/api/sync/pull',
    outcome: 'abandoned',
    outcomeColor: 'warning',
    statusLabel: TRANSACTION_EMPTY_LABEL,
    statusColor: 'default',
    hasHttpStatus: false,
    durationLabel: TRANSACTION_EMPTY_LABEL,
    arrivalCapturedAtMs: capturedAtMs,
  };
}

describe('TransactionTable — elapsed-clock tick cost', () => {
  beforeEach(() => {
    rowRenders.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('re-renders no terminal row when the pending row elapsed clock ticks', () => {
    const rows = [arrivalRow(Date.now()), terminalRow('req-1'), terminalRow('req-2'), terminalRow('req-3')];
    render(<TransactionTable hasNextPage={false} isLoading={false} onLoadMore={vi.fn()} onSelect={vi.fn()} rows={rows} selectedId={null} />);

    const rendersBeforeTick = new Map(rowRenders);
    expect(rendersBeforeTick.size).toBe(4);

    act(() => {
      vi.advanceTimersByTime(ELAPSED_CLOCK_TICK_MS);
    });

    expect(screen.getByText('500ms')).toBeInTheDocument();
    expect(rowRenders).toEqual(rendersBeforeTick);
  });

  it('keeps every row untouched across ten consecutive ticks, so cost never scales with the loaded rows', () => {
    const rows = [arrivalRow(Date.now()), ...Array.from({ length: 25 }, (_unused, index) => terminalRow(`req-${index}`))];
    render(<TransactionTable hasNextPage={false} isLoading={false} onLoadMore={vi.fn()} onSelect={vi.fn()} rows={rows} selectedId={null} />);

    const rendersBeforeTicks = new Map(rowRenders);

    act(() => {
      vi.advanceTimersByTime(ELAPSED_CLOCK_TICK_MS * 10);
    });

    expect(screen.getByText('5.0s')).toBeInTheDocument();
    expect(rowRenders).toEqual(rendersBeforeTicks);
  });
});
