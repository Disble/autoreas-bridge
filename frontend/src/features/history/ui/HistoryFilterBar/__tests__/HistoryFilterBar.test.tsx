import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoryFilterBar } from '../HistoryFilterBar';
import type { HistoryFilterBarProps } from '../history-filter-bar.types';

afterEach(cleanup);

/**
 * Builds the bar's full prop set, overridden per case.
 * @param overrides The props a case is about.
 * @returns A complete `HistoryFilterBarProps`.
 */
function props(overrides: Partial<HistoryFilterBarProps> = {}): HistoryFilterBarProps {
  return {
    order: 'newest',
    onSortChange: vi.fn(),
    ...overrides,
  };
}

describe('HistoryFilterBar', () => {
  it('offers both sort orders from the accessible trigger', () => {
    render(<HistoryFilterBar {...props()} />);

    fireEvent.click(screen.getByRole('button', { name: /sort watch history/i }));

    expect(screen.getByRole('option', { name: 'Newest first' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Oldest first' })).toBeInTheDocument();
  });

  it('reports the order the user picked', () => {
    const onSortChange = vi.fn();
    render(<HistoryFilterBar {...props({ onSortChange })} />);

    fireEvent.click(screen.getByRole('button', { name: /sort watch history/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Oldest first' }));

    expect(onSortChange).toHaveBeenCalledWith('oldest');
  });

  it('shows the caller-provided order as selected', () => {
    render(<HistoryFilterBar {...props({ order: 'oldest' })} />);

    expect(screen.getByRole('button', { name: /sort watch history/i })).toHaveTextContent('Oldest first');
  });
});
