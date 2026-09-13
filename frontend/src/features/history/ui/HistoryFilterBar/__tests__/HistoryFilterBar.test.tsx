import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
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

  describe('watched range', () => {
    /**
     * Mirrors how a real caller wires `HistoryFilterBar` to a URL-backed
     * range: `onRangeChange` feeds straight back into the controlled `range`
     * prop, so a second edit sees the FIRST edit's committed result rather
     * than the test's static initial value.
     * @param initialRange The range the bar starts controlled with.
     * @param onRangeChange A spy the harness also reports every write to.
     */
    function ControlledRangeHarness({
      initialRange,
      onRangeChange,
    }: Readonly<{
      initialRange: HistoryDateRange;
      onRangeChange: (range: HistoryDateRange | undefined) => void;
    }>) {
      const [range, setRange] = useState<HistoryDateRange | undefined>(initialRange);

      return (
        <HistoryFilterBar
          {...props({
            range,
            onRangeChange: (next) => {
              setRange(next);
              onRangeChange(next);
            },
          })}
        />
      );
    }

    it('reports an edit as one complete {from, to} write', () => {
      const onRangeChange = vi.fn();
      render(<ControlledRangeHarness initialRange={{ from: '2026-09-01', to: '2026-09-02' }} onRangeChange={onRangeChange} />);

      const [, endDay] = screen.getAllByRole('spinbutton', { name: /day/i });
      fireEvent.keyDown(endDay, { key: 'ArrowUp' });

      expect(onRangeChange).toHaveBeenCalledExactlyOnceWith({ from: '2026-09-01', to: '2026-09-03' });
    });

    it('ignores an edit that would invert the range (from > to), never writing it', () => {
      const onRangeChange = vi.fn();
      render(<ControlledRangeHarness initialRange={{ from: '2026-09-01', to: '2026-09-02' }} onRangeChange={onRangeChange} />);

      const [startDay] = screen.getAllByRole('spinbutton', { name: /day/i });
      fireEvent.keyDown(startDay, { key: 'ArrowUp' }); // start -> 2026-09-02, equal to `to`: still a valid range
      fireEvent.keyDown(startDay, { key: 'ArrowUp' }); // start -> 2026-09-03, now after `to`: ignored

      expect(onRangeChange).toHaveBeenCalledTimes(1);
      expect(onRangeChange).toHaveBeenLastCalledWith({ from: '2026-09-02', to: '2026-09-02' });
    });
  });
});
