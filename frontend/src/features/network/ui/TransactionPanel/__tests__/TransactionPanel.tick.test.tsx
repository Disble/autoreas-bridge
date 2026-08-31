import { act, cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureRuntimeSource } from '../../../../../infrastructure/capture-runtime-source/capture-runtime-source.types';
import type { CaptureTransactionSource } from '../../../../../infrastructure/capture-transaction-source/capture-transaction-source.types';
import type { CaptureRow } from '../../../../../shared/contracts/capture.types';
import { ELAPSED_CLOCK_TICK_MS } from '../../../../../shared/hooks/use-elapsed-clock/use-elapsed-clock.constants';
import { resetTransactionStore } from '../../../../../shared/store/transaction-store/transaction-store.helpers';
import type { TransactionRowProps } from '../transaction-panel.types';
import { TransactionPanel } from '../TransactionPanel';

/**
 * Render tally per row id, written by the counting passthrough installed around
 * the real row. This is the regression guard: the rail's elapsed clock used to
 * live in the panel, so every 500ms tick re-rendered the panel, re-mapped every
 * visible row and rebuilt the whole table. A test that only checks the pending
 * label advancing would have passed happily through all of that.
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

/** Builds one terminal capture row with a distinct id. */
function terminalRow(id: string): CaptureRow {
  return {
    requestId: id,
    capturedAtMs: 1000,
    kind: 'patch',
    route: `/api/animes/${id}`,
    transport: 'http',
    outcome: 'accepted',
    httpStatus: 200,
    durationMs: 42,
  };
}

/** Builds one transport-only arrival row: outstanding, so it drives the clock. */
function arrivalRow(capturedAtMs: number): CaptureRow {
  return {
    requestId: 'req-live',
    capturedAtMs,
    kind: 'post',
    route: '/api/sync/pull',
    transport: 'http',
    outcome: 'pending',
  };
}

/** Builds a fake transaction source resolving one page of the given rows. */
function createFakeSource(items: readonly CaptureRow[]): CaptureTransactionSource {
  return {
    listTransactions: vi.fn().mockResolvedValue({
      items,
      appliedLimit: 25,
      malformedRowsSkipped: 0,
      warningCount: 0,
      degraded: false,
    }),
    getTransaction: vi.fn().mockResolvedValue({ found: false, item: undefined, degraded: false }),
    summarizeTransactions: vi.fn().mockResolvedValue({ groups: [], degraded: false }),
  } as unknown as CaptureTransactionSource;
}

/** Builds a fake capture runtime source with a no-op subscription. */
function createFakeRuntimeSource(): CaptureRuntimeSource {
  return { subscribeCaptureTransactions: vi.fn().mockReturnValue(() => undefined) };
}

describe('TransactionPanel — elapsed-clock tick cost', () => {
  beforeEach(() => {
    rowRenders.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    resetTransactionStore();
    vi.useRealTimers();
  });

  it('re-renders no row when the outstanding row elapsed clock ticks', async () => {
    const items = [arrivalRow(Date.now()), ...Array.from({ length: 12 }, (_unused, index) => terminalRow(`req-${index}`))];
    render(<TransactionPanel runtimeSource={createFakeRuntimeSource()} source={createFakeSource(items)} />);

    await vi.waitFor(() => expect(rowRenders.size).toBe(13));
    const rendersBeforeTicks = new Map(rowRenders);

    act(() => {
      vi.advanceTimersByTime(ELAPSED_CLOCK_TICK_MS * 4);
    });

    expect(screen.getByText('2.0s')).toBeInTheDocument();
    expect(rowRenders).toEqual(rendersBeforeTicks);
  });
});
