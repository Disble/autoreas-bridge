import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TRANSACTION_EMPTY_STATE_MESSAGE,
  TRANSACTION_LOADING_STATE_MESSAGE,
  TRANSACTION_TABLE_SKELETON_ROW_COUNT,
  TRANSACTION_UPDATING_STATE_MESSAGE,
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

describe('TransactionTable', () => {
  afterEach(() => {
    cleanup();
  });

  it('keeps the column headers, marks the table busy, names the load and renders placeholder rows while loading', () => {
    const { container } = render(<TransactionTable isUpdating={false} isLoading scrollRef={vi.fn()} topSpacerHeightPx={0} bottomSpacerHeightPx={0} onSelect={vi.fn()} rows={[]} selectedId={null} />);

    expect(screen.getByRole('columnheader', { name: 'Route' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Outcome' })).toBeInTheDocument();
    expect(container.querySelector('[data-testid="transaction-table-skeleton-table"]')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status', { name: TRANSACTION_LOADING_STATE_MESSAGE })).toBeInTheDocument();
    expect(screen.getAllByTestId('transaction-table-skeleton-row')).toHaveLength(TRANSACTION_TABLE_SKELETON_ROW_COUNT);
  });

  it('drops the busy flag, the status region and the placeholder once resolved', () => {
    const { container } = render(<TransactionTable isUpdating={false} isLoading={false} scrollRef={vi.fn()} topSpacerHeightPx={0} bottomSpacerHeightPx={0} onSelect={vi.fn()} rows={[row()]} selectedId={null} />);

    expect(container.querySelector('[data-slot="table"]')).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('transaction-table-skeleton-row')).toHaveLength(0);
    expect(screen.getByText('/api/animes/anime-1')).toBeInTheDocument();
  });

  it('renders only placeholder rows while loading, even with rows already accumulated in state', () => {
    // The panel derives `isLoading` as "nothing to show yet", so through the
    // composition root this prop shape only occurs on a first load. The
    // component contract stands on its own: the skeleton appears ONLY while
    // `isLoading`, and never while `isUpdating`.
    const { container } = render(<TransactionTable isUpdating={false} isLoading scrollRef={vi.fn()} topSpacerHeightPx={0} bottomSpacerHeightPx={0} onSelect={vi.fn()} rows={[row()]} selectedId={null} />);

    expect(screen.getAllByTestId('transaction-table-skeleton-row')).toHaveLength(TRANSACTION_TABLE_SKELETON_ROW_COUNT);
    expect(screen.queryByText('/api/animes/anime-1')).not.toBeInTheDocument();
    expect(container.querySelector('[data-transaction-spacer]')).toBeNull();
  });

  it('keeps the rows on screen, busy and announced, while a settled filter query updates them — never a skeleton', () => {
    // `isUpdating` is the settled-filter-in-flight state: the previous rows
    // stay mounted, the table goes busy, the announcement fires, and the
    // skeleton must not swap the rows out.
    const { container } = render(<TransactionTable isUpdating isLoading={false} scrollRef={vi.fn()} topSpacerHeightPx={0} bottomSpacerHeightPx={0} onSelect={vi.fn()} rows={[row()]} selectedId={null} />);

    expect(container.querySelector('[data-slot="table"]')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status', { name: TRANSACTION_UPDATING_STATE_MESSAGE })).toBeInTheDocument();
    expect(screen.getByText('/api/animes/anime-1')).toBeInTheDocument();
    expect(screen.queryAllByTestId('transaction-table-skeleton-row')).toHaveLength(0);
  });

  it('shows the empty-state message when not loading and there are no rows', () => {
    render(<TransactionTable isUpdating={false} isLoading={false} scrollRef={vi.fn()} topSpacerHeightPx={0} bottomSpacerHeightPx={0} onSelect={vi.fn()} rows={[]} selectedId={null} />);

    expect(screen.getByText(TRANSACTION_EMPTY_STATE_MESSAGE)).toBeInTheDocument();
  });

  it('renders a real status and duration per row (no fabricated "–")', () => {
    render(<TransactionTable isUpdating={false} isLoading={false} scrollRef={vi.fn()} topSpacerHeightPx={0} bottomSpacerHeightPx={0} onSelect={vi.fn()} rows={[row()]} selectedId={null} />);

    expect(screen.getByText('/api/animes/anime-1')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('42ms')).toBeInTheDocument();
  });

  it('marks only the Time column as the row header: exactly one rowheader cell per rendered body row', () => {
    // React Aria renders `role="rowheader"` on the CELLS of the `isRowHeader`
    // column — one per body row, the two virtual spacers included — never on
    // the column headers themselves. Marking every column (or every column but
    // Time) as the row header multiplies the count and swaps the cell text to
    // the wrong columns, so the exact shape below kills both mutants.
    render(
      <TransactionTable
        bottomSpacerHeightPx={144}
        isLoading={false}
        isUpdating={false}
        onSelect={vi.fn()}
        rows={[row(), row({ id: 'req-2', route: '/api/animes/anime-2' })]}
        scrollRef={vi.fn()}
        selectedId={null}
        topSpacerHeightPx={72}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Time' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Method' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Route' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Outcome' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Duration' })).toBeInTheDocument();
    const rowheaders = screen.getAllByRole('rowheader');
    expect(rowheaders).toHaveLength(4);
    expect(rowheaders.map((cell) => cell.textContent)).toEqual(['', '10:30:45', '10:30:45', '']);
  });

  it('selects exactly the row whose id is selected and leaves every other row unselected', () => {
    render(
      <TransactionTable
        bottomSpacerHeightPx={0}
        isLoading={false}
        isUpdating={false}
        onSelect={vi.fn()}
        rows={[row(), row({ id: 'req-2', route: '/api/animes/anime-2' })]}
        scrollRef={vi.fn()}
        selectedId="req-1"
        topSpacerHeightPx={0}
      />,
    );

    expect(screen.getByText('/api/animes/anime-1').closest('tr')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('/api/animes/anime-2').closest('tr')).toHaveAttribute('aria-selected', 'false');
    expect(document.querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
  });

  it('leaves no row selected while the selection is cleared', () => {
    render(
      <TransactionTable
        bottomSpacerHeightPx={0}
        isLoading={false}
        isUpdating={false}
        onSelect={vi.fn()}
        rows={[row(), row({ id: 'req-2', route: '/api/animes/anime-2' })]}
        scrollRef={vi.fn()}
        selectedId={null}
        topSpacerHeightPx={0}
      />,
    );

    expect(document.querySelectorAll('[aria-selected="true"]')).toHaveLength(0);
    expect(screen.getByText('/api/animes/anime-1').closest('tr')).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onSelect with the row id when a row is clicked', () => {
    const onSelect = vi.fn();
    render(<TransactionTable isUpdating={false} isLoading={false} scrollRef={vi.fn()} topSpacerHeightPx={0} bottomSpacerHeightPx={0} onSelect={onSelect} rows={[row()]} selectedId={null} />);

    screen.getByText('/api/animes/anime-1').closest('tr')?.click();

    expect(onSelect).toHaveBeenCalledWith('req-1');
  });

  it('renders a rejected outcome pill distinguishable from an accepted one', () => {
    render(
      <TransactionTable
        isLoading={false}
        isUpdating={false}
        scrollRef={vi.fn()}
          topSpacerHeightPx={0}
          bottomSpacerHeightPx={0}
        onSelect={vi.fn()}
        rows={[row({ id: 'req-1', outcome: 'accepted', outcomeColor: 'success' }), row({ id: 'req-2', outcome: 'rejected', outcomeColor: 'danger' })]}
        selectedId={null}
      />,
    );

    const acceptedChip = screen.getByText('accepted').closest('[data-slot="chip"]');
    const rejectedChip = screen.getByText('rejected').closest('[data-slot="chip"]');

    expect(acceptedChip).toHaveClass('chip--success');
    expect(rejectedChip).toHaveClass('chip--danger');
  });

  it('renders no status chip and the neutral absence marker for a statusless row, and never fabricates 0 or 200', () => {
    render(
      <TransactionTable
        isLoading={false}
        isUpdating={false}
        scrollRef={vi.fn()}
          topSpacerHeightPx={0}
          bottomSpacerHeightPx={0}
        onSelect={vi.fn()}
        rows={[row({ id: 'req-live', outcome: 'pending', outcomeColor: 'accent', hasHttpStatus: false, statusLabel: '–' })]}
        selectedId={null}
      />,
    );

    expect(screen.queryByText('200')).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.getByText('–')).toBeInTheDocument();
  });

  it('attaches the rail scroll ref to the scroll container', () => {
    const scrollRef = vi.fn();
    const { container } = render(
      <TransactionTable
        bottomSpacerHeightPx={0}
        isLoading={false}
        isUpdating={false}
        onSelect={vi.fn()}
        rows={[row()]}
        scrollRef={scrollRef}
        selectedId={null}
        topSpacerHeightPx={0}
      />,
    );

    expect(scrollRef).toHaveBeenCalledWith(container.querySelector('[data-transaction-scroll]'));
  });

  it('renders the two virtual spacer rows spanning all six columns when the window is bounded', () => {
    render(
      <TransactionTable
        bottomSpacerHeightPx={144}
        isLoading={false}
        isUpdating={false}
        onSelect={vi.fn()}
        rows={[row(), row({ id: 'req-2', route: '/api/animes/anime-2' })]}
        scrollRef={vi.fn()}
        selectedId={null}
        topSpacerHeightPx={72}
      />,
    );

    const top = document.querySelector<HTMLElement>('[data-transaction-spacer="top"]');
    const bottom = document.querySelector<HTMLElement>('[data-transaction-spacer="bottom"]');

    expect(top).not.toBeNull();
    expect(bottom).not.toBeNull();
    expect(top?.style.height).toBe('72px');
    expect(bottom?.style.height).toBe('144px');
    expect(top?.querySelector('td')).toHaveAttribute('colspan', '6');
    // Both real rows stayed mounted between the spacers.
    expect(screen.getByText('/api/animes/anime-1')).toBeInTheDocument();
    expect(screen.getByText('/api/animes/anime-2')).toBeInTheDocument();
  });
});
