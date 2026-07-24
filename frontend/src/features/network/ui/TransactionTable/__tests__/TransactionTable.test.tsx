import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRANSACTION_EMPTY_STATE_MESSAGE, TRANSACTION_LOADING_STATE_MESSAGE } from '../../TransactionPanel/transaction-panel.constants';
import type { TransactionRowViewModel } from '../../TransactionPanel/transaction-panel.types';
import { TransactionTable } from '../TransactionTable';

function row(overrides: Partial<TransactionRowViewModel> = {}): TransactionRowViewModel {
  return {
    id: 'req-1',
    methodKind: 'patch',
    route: '/api/animes/anime-1',
    outcome: 'accepted',
    statusLabel: '200',
    statusColor: 'success',
    durationLabel: '42ms',
    timeLabel: '10:30:45',
    ...overrides,
  };
}

describe('TransactionTable', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows the loading message while isLoading is true', () => {
    render(<TransactionTable isLoading onSelect={vi.fn()} rows={[]} selectedId={null} />);

    expect(screen.getByText(TRANSACTION_LOADING_STATE_MESSAGE)).toBeInTheDocument();
  });

  it('shows the empty-state message when not loading and there are no rows', () => {
    render(<TransactionTable isLoading={false} onSelect={vi.fn()} rows={[]} selectedId={null} />);

    expect(screen.getByText(TRANSACTION_EMPTY_STATE_MESSAGE)).toBeInTheDocument();
  });

  it('renders a real status and duration per row (no fabricated "–")', () => {
    render(<TransactionTable isLoading={false} onSelect={vi.fn()} rows={[row()]} selectedId={null} />);

    expect(screen.getByText('/api/animes/anime-1')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('42ms')).toBeInTheDocument();
  });

  it('calls onSelect with the row id when a row is clicked', () => {
    const onSelect = vi.fn();
    render(<TransactionTable isLoading={false} onSelect={onSelect} rows={[row()]} selectedId={null} />);

    screen.getByText('/api/animes/anime-1').closest('tr')?.click();

    expect(onSelect).toHaveBeenCalledWith('req-1');
  });
});
