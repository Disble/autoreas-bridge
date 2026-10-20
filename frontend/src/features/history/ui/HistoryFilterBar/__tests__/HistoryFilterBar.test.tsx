import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HISTORY_FILTER_BAR_RANGE_ARIA_LABEL } from '../history-filter-bar.constants';
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
     * Finds the range trigger inside its own bar by accessible name, so the
     * lookup stays scoped to this widget instead of scanning the document.
     * @param container The rendered bar's container.
     * @returns The range trigger button.
     */
    function rangeTrigger(container: HTMLElement): HTMLElement {
      return within(container).getByRole('button', {
        name: (accessibleName) => accessibleName.startsWith(HISTORY_FILTER_BAR_RANGE_ARIA_LABEL),
      });
    }

    /**
     * Opens the range calendar from its trigger.
     * @param container The rendered bar's container.
     */
    function openCalendar(container: HTMLElement): void {
      fireEvent.click(rangeTrigger(container));
    }

    /**
     * The open calendar's own surface (`role="application"`, labelled by the
     * range aria-label). Day cells and year cells both live inside it, so
     * assertions scoped here cost one accessible-name lookup each instead of
     * the document-wide computation a `screen` role query pays for across the
     * bar and the calendar's 42 day cells plus its 20 always-rendered year
     * cells.
     * @returns The open calendar element.
     */
    function calendar(): HTMLElement {
      return screen.getByRole('application', {
        name: (accessibleName) => accessibleName.startsWith(HISTORY_FILTER_BAR_RANGE_ARIA_LABEL),
      });
    }

    it.each<[string, HistoryDateRange | undefined, string]>([
      ['the committed range', { from: '2026-09-01', to: '2026-09-13' }, 'Sep 1 – Sep 13, 2026'],
      ['a placeholder without a range', undefined, 'Any date'],
    ])('shows %s on the trigger', (_case, range, expected) => {
      const { container } = render(<HistoryFilterBar {...props({ range })} />);

      expect(rangeTrigger(container)).toHaveTextContent(expected);
    });

    it('reports a calendar pick as one complete {from, to} write', () => {
      const onRangeChange = vi.fn();
      const { container } = render(<HistoryFilterBar {...props({ range: { from: '2026-09-01', to: '2026-09-02' }, onRangeChange })} />);

      openCalendar(container);
      fireEvent.click(within(calendar()).getByRole('button', { name: /september 3, 2026/i }));
      fireEvent.click(within(calendar()).getByRole('button', { name: /september 5, 2026/i }));

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
      // Without a range the calendar opens on the current month, so pin the clock.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 8, 15));
      try {
        const { container } = render(<HistoryFilterBar {...props()} />);

        openCalendar(container);

        expect(within(calendar()).getByRole('button', { name: /september 1, 2026/i })).toBeInTheDocument();
        expect(screen.getByText('Sun')).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('opens a year picker naming years', () => {
      // The picker opens on whatever month "today" is, and its year grid is
      // centred on that month, so pin the clock: without it the `2026` cell
      // exists only while the real date stays near 2026.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 8, 15));
      try {
        const { container } = render(<HistoryFilterBar {...props()} />);

        openCalendar(container);
        fireEvent.click(within(calendar()).getByRole('button', { name: /year selector/i }));

        expect(within(calendar()).getByRole('button', { name: '2026' })).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
