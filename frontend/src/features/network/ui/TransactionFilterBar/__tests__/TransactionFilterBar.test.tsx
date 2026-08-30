import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TransactionFilterBarProps } from '../../TransactionPanel/transaction-panel.types';
import { TransactionFilterBar } from '../TransactionFilterBar';

/** Builds the bar's props with every control unset and every callback stubbed. */
function props(overrides: Partial<TransactionFilterBarProps> = {}): TransactionFilterBarProps {
  return {
    route: '',
    outcome: '',
    kind: '',
    status: '',
    onRouteChange: vi.fn(),
    onOutcomeChange: vi.fn(),
    onKindChange: vi.fn(),
    onStatusChange: vi.fn(),
    ...overrides,
  };
}

describe('TransactionFilterBar', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders one field per backend-evaluated filter', () => {
    render(<TransactionFilterBar {...props()} />);

    expect(screen.getByLabelText('Route')).toBeInTheDocument();
    expect(screen.getByLabelText('Outcome')).toBeInTheDocument();
    expect(screen.getByLabelText('Kind')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('offers no control that narrows only the rows already loaded', () => {
    render(<TransactionFilterBar {...props()} />);

    // The free-text search box and the status-class pills both used to filter
    // the loaded page, so a match one page further down was unreachable however
    // far the user paged. Their absence is the fix, and this asserts it.
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('radio', { name: '4xx' })).toBeNull();
  });

  it('forwards the exact status the user typed', () => {
    const onStatusChange = vi.fn();
    render(<TransactionFilterBar {...props({ onStatusChange })} />);

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: '404' } });

    expect(onStatusChange).toHaveBeenCalledWith('404');
  });

  it('forwards a route change', () => {
    const onRouteChange = vi.fn();
    render(<TransactionFilterBar {...props({ onRouteChange })} />);

    fireEvent.change(screen.getByLabelText('Route'), { target: { value: '/api/animes/anime-2' } });

    expect(onRouteChange).toHaveBeenCalledWith('/api/animes/anime-2');
  });
});
