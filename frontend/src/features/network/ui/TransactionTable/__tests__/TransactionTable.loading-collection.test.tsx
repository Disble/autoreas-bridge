import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TRANSACTION_LOADING_STATE_MESSAGE,
  TRANSACTION_TABLE_SKELETON_ROW_COUNT,
} from '../../TransactionPanel/transaction-panel.constants';
import type { TransactionRowViewModel } from '../../TransactionPanel/transaction-panel.types';
import { TransactionTable } from '../TransactionTable';

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

/**
 * Loading placeholders must never be React Aria collection rows.
 *
 * React Aria's focus-fixup scan (`useGridState`, react-stately) walks the
 * collection looking for a row focus can move to, and it has no iteration bound:
 * when every row of the collection is "skippable" - disabled, or a header row -
 * its index oscillates between two adjacent values forever. A collection in
 * which EVERY row is disabled is exactly what the loading placeholders used to
 * build (each placeholder carried `isDisabled`), so a focused row plus a reload
 * wedged the renderer at 100% of a core with the skeleton frozen on screen
 * (2026-09-21 Activity freeze, captured live).
 *
 * The placeholders therefore render outside the collection. These assertions
 * fail if anyone puts them back inside it, which is the whole guard: the loop
 * itself cannot be asserted directly, because a synchronous infinite loop hangs
 * the test runner instead of failing it.
 */
describe('TransactionTable loading placeholders', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the placeholders outside the React Aria collection while loading', () => {
    const { container } = render(
      <TransactionTable
        bottomSpacerHeightPx={144}
        isLoading
        isUpdating={false}
        onSelect={vi.fn()}
        rows={[row()]}
        scrollRef={vi.fn()}
        selectedId="req-1"
        topSpacerHeightPx={72}
      />,
    );

    expect(screen.getAllByTestId('transaction-table-skeleton-row')).toHaveLength(TRANSACTION_TABLE_SKELETON_ROW_COUNT);
    // The trap: no React Aria table (and therefore no collection) may exist while
    // the placeholders are on screen, because every placeholder row is skippable.
    expect(container.querySelector('[data-slot="table"]')).toBeNull();
  });

  it('keeps the loading announcement and the busy contract on the placeholder surface', () => {
    const { container } = render(
      <TransactionTable
        bottomSpacerHeightPx={0}
        isLoading
        isUpdating={false}
        onSelect={vi.fn()}
        rows={[]}
        scrollRef={vi.fn()}
        selectedId={null}
        topSpacerHeightPx={0}
      />,
    );

    expect(screen.getByRole('status', { name: TRANSACTION_LOADING_STATE_MESSAGE })).toBeInTheDocument();
    expect(container.querySelector('[data-transaction-scroll] [aria-busy="true"]')).not.toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Route' })).toBeInTheDocument();
  });

  it('mounts the React Aria table again once the rows resolve', () => {
    const { container } = render(
      <TransactionTable
        bottomSpacerHeightPx={0}
        isLoading={false}
        isUpdating={false}
        onSelect={vi.fn()}
        rows={[row()]}
        scrollRef={vi.fn()}
        selectedId={null}
        topSpacerHeightPx={0}
      />,
    );

    expect(container.querySelector('[data-slot="table"]')).not.toBeNull();
    expect(screen.queryAllByTestId('transaction-table-skeleton-row')).toHaveLength(0);
    expect(screen.getByText('/api/animes/anime-1')).toBeInTheDocument();
  });
});
