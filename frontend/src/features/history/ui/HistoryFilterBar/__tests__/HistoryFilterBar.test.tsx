import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoryFilterBar } from '../HistoryFilterBar';
import type { HistoryDateRange, HistoryFilterBarProps } from '../history-filter-bar.types';

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
    range: undefined,
    onRangeChange: vi.fn(),
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
    ['Sort picks newest', /sort watch history/i, { order: 'oldest' }, 'onSortChange', 'Newest first', 'newest'],
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

  it('labels every control above it', () => {
    render(<HistoryFilterBar {...props()} />);

    for (const label of ['Search', 'Status', 'Type', 'Watched', 'Sort']) {
      expect(screen.getByText(label, { selector: '[data-slot="label"]' })).toBeInTheDocument();
    }
    expect(screen.getByPlaceholderText('Search by name...')).toBeInTheDocument();
  });

  describe('watched range', () => {
    /**
     * Opens the range calendar from its trigger.
     * @param container The rendered bar's container.
     */
    function openCalendar(container: HTMLElement): void {
      const trigger = container.querySelector('button[data-slot="date-range-picker-trigger"]');
      if (trigger === null) {
        throw new Error('range trigger not rendered');
      }
      fireEvent.click(trigger);
    }

    it.each<[string, HistoryDateRange | undefined, string]>([
      ['the committed range', { from: '2026-09-01', to: '2026-09-13' }, 'Sep 1 – Sep 13, 2026'],
      ['a placeholder without a range', undefined, 'Any date'],
    ])('shows %s on the trigger', (_case, range, expected) => {
      const { container } = render(<HistoryFilterBar {...props({ range })} />);

      expect(container.querySelector('button[data-slot="date-range-picker-trigger"]')).toHaveTextContent(expected);
    });

    it('reports a calendar pick as one complete {from, to} write', () => {
      const onRangeChange = vi.fn();
      const { container } = render(<HistoryFilterBar {...props({ range: { from: '2026-09-01', to: '2026-09-02' }, onRangeChange })} />);

      openCalendar(container);
      fireEvent.click(screen.getByRole('button', { name: /september 3, 2026/i }));
      fireEvent.click(screen.getByRole('button', { name: /september 5, 2026/i }));

      expect(onRangeChange).toHaveBeenCalledExactlyOnceWith({ from: '2026-09-03', to: '2026-09-05' });
    });

    it('clears a committed range from the calendar', () => {
      const onRangeChange = vi.fn();
      const { container } = render(<HistoryFilterBar {...props({ range: { from: '2026-09-01', to: '2026-09-13' }, onRangeChange })} />);

      openCalendar(container);
      fireEvent.click(screen.getByRole('button', { name: 'Clear dates' }));

      expect(onRangeChange).toHaveBeenCalledExactlyOnceWith(undefined);
    });

    it('offers no clear action without a range', () => {
      const { container } = render(<HistoryFilterBar {...props()} />);

      openCalendar(container);

      expect(screen.queryByRole('button', { name: 'Clear dates' })).toBeNull();
    });

    it('opens a calendar with day cells and weekday headers', () => {
      const { container } = render(<HistoryFilterBar {...props()} />);

      openCalendar(container);

      expect(screen.getByRole('button', { name: /september 1, 2026/i })).toBeInTheDocument();
      expect(screen.getByText('Sun')).toBeInTheDocument();
    });

    it('opens a year picker naming years', () => {
      const { container } = render(<HistoryFilterBar {...props()} />);

      openCalendar(container);
      fireEvent.click(screen.getByRole('button', { name: /year selector/i }));

      expect(screen.getByRole('button', { name: '2026' })).toBeInTheDocument();
    });
  });
});
