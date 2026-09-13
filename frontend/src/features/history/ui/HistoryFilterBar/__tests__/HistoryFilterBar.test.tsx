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
    search: '',
    onSearchChange: vi.fn(),
    status: undefined,
    onStatusChange: vi.fn(),
    type: undefined,
    onTypeChange: vi.fn(),
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

  it('shows the caller-provided order as selected', () => {
    render(<HistoryFilterBar {...props({ order: 'oldest' })} />);

    expect(screen.getByRole('button', { name: /sort watch history/i })).toHaveTextContent('Oldest first');
  });

  it('renders the caller-provided search draft, and forwards every further keystroke immediately, undebounced', () => {
    const onSearchChange = vi.fn();
    render(<HistoryFilterBar {...props({ search: 'naruto', onSearchChange })} />);

    expect(screen.getByLabelText('Search watch history')).toHaveValue('naruto');

    fireEvent.change(screen.getByLabelText('Search watch history'), { target: { value: 'frieren' } });

    expect(onSearchChange).toHaveBeenCalledWith('frieren');
  });

  it.each([
    ['Status', /filter by status/i],
    ['Type', /filter by type/i],
  ])('shows "All" selected by default and offers "All" plus the four %s options', (_label, ariaLabel) => {
    render(<HistoryFilterBar {...props()} />);
    const trigger = screen.getByRole('button', { name: ariaLabel });
    expect(trigger).toHaveTextContent('All');

    fireEvent.click(trigger);

    expect(screen.getAllByRole('option')).toHaveLength(5);
    expect(screen.getByRole('option', { name: 'All' })).toBeInTheDocument();
  });

  it.each<[string, RegExp, Partial<HistoryFilterBarProps>, 'onSortChange' | 'onStatusChange' | 'onTypeChange', string, unknown]>([
    ['Sort picks oldest', /sort watch history/i, {}, 'onSortChange', 'Oldest first', 'oldest'],
    ['Status picks a value', /filter by status/i, {}, 'onStatusChange', 'Viendo', 0],
    ['Status clears to All', /filter by status/i, { status: 0 }, 'onStatusChange', 'All', undefined],
    ['Type picks a value', /filter by type/i, {}, 'onTypeChange', 'Película', 1],
    ['Type clears to All', /filter by type/i, { type: 1 }, 'onTypeChange', 'All', undefined],
  ])('%s and reports it', (_label, trigger, initial, handler, option, expected) => {
    const onChange = vi.fn();
    render(<HistoryFilterBar {...props({ ...initial, [handler]: onChange })} />);

    fireEvent.click(screen.getByRole('button', { name: trigger }));
    fireEvent.click(screen.getByRole('option', { name: option }));

    expect(onChange).toHaveBeenCalledWith(expected);
  });
});
