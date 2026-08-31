import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRANSACTION_EMPTY_STATE_MESSAGE, TRANSACTION_LOADING_STATE_MESSAGE } from '../../TransactionPanel/transaction-panel.constants';
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

  it('shows the loading message while isLoading is true', () => {
    render(<TransactionTable hasNextPage={false} onLoadMore={vi.fn()} isLoading onSelect={vi.fn()} rows={[]} selectedId={null} />);

    expect(screen.getByText(TRANSACTION_LOADING_STATE_MESSAGE)).toBeInTheDocument();
  });

  it('shows the empty-state message when not loading and there are no rows', () => {
    render(<TransactionTable hasNextPage={false} onLoadMore={vi.fn()} isLoading={false} onSelect={vi.fn()} rows={[]} selectedId={null} />);

    expect(screen.getByText(TRANSACTION_EMPTY_STATE_MESSAGE)).toBeInTheDocument();
  });

  it('renders a real status and duration per row (no fabricated "–")', () => {
    render(<TransactionTable hasNextPage={false} onLoadMore={vi.fn()} isLoading={false} onSelect={vi.fn()} rows={[row()]} selectedId={null} />);

    expect(screen.getByText('/api/animes/anime-1')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('42ms')).toBeInTheDocument();
  });

  it('calls onSelect with the row id when a row is clicked', () => {
    const onSelect = vi.fn();
    render(<TransactionTable hasNextPage={false} onLoadMore={vi.fn()} isLoading={false} onSelect={onSelect} rows={[row()]} selectedId={null} />);

    screen.getByText('/api/animes/anime-1').closest('tr')?.click();

    expect(onSelect).toHaveBeenCalledWith('req-1');
  });

  it('renders a rejected outcome pill distinguishable from an accepted one', () => {
    render(
      <TransactionTable
        hasNextPage={false}
        isLoading={false}
        onLoadMore={vi.fn()}
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
        hasNextPage={false}
        isLoading={false}
        onLoadMore={vi.fn()}
        onSelect={vi.fn()}
        rows={[row({ id: 'req-live', outcome: 'pending', outcomeColor: 'accent', hasHttpStatus: false, statusLabel: '–' })]}
        selectedId={null}
      />,
    );

    expect(screen.queryByText('200')).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.getByText('–')).toBeInTheDocument();
  });
});
