import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { SELECTION_SORT_OPTIONS } from '../selection-board.constants';
import type { SelectionFilterToolbarProps } from '../selection-board.types';
import { createSelectionView, toSelectionFilterGroups, toSelectionViewSummary } from '../selection-view.helpers';
import { SelectionFilterToolbar } from '../SelectionFilterToolbar';

/** Builds the toolbar props from criteria overrides and spies for every callback. */
function toolbarProps(overrides: Partial<SelectionFilterToolbarProps> = {}): SelectionFilterToolbarProps {
  const criteria = overrides.criteria ?? createSelectionView();
  return {
    criteria,
    groups: toSelectionFilterGroups(),
    sortOptions: SELECTION_SORT_OPTIONS,
    summaryOptions: toSelectionViewSummary(criteria),
    activeFilterCount: criteria.grades.length + criteria.verdicts.length + criteria.considerations.length,
    matchingCount: 24,
    totalCount: 24,
    onGroupChange: vi.fn(),
    onResetFilters: vi.fn(),
    onResetView: vi.fn(),
    onSortChange: vi.fn(),
    ...overrides,
  };
}

/** Opens the filter popover and returns its dialog. */
async function openFilters() {
  fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
  return screen.findByRole('dialog', { name: 'Filters' });
}

describe('SelectionFilterToolbar', () => {
  it.each([
    [0, 'Filters'],
    [2, 'Filters, 2 active'],
  ])('labels the trigger from the active value count (%i)', (count, label) => {
    render(<SelectionFilterToolbar {...toolbarProps({ activeFilterCount: count })} />);

    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  });

  it.each([
    [0, 'Filters'],
    [2, 'Filters, 2 active'],
  ])('labels the trigger from the active value count (%i)', (count, label) => {
    render(<SelectionFilterToolbar {...toolbarProps({ activeFilterCount: count })} />);

    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  });

  it('shows the count chip inside the trigger only once a value is selected', () => {
    const none = render(<SelectionFilterToolbar {...toolbarProps({ activeFilterCount: 0 })} />);
    expect(screen.getByRole('button', { name: 'Filters' }).textContent).not.toContain('0');
    none.unmount();

    render(<SelectionFilterToolbar {...toolbarProps({ activeFilterCount: 2 })} />);
    expect(screen.getByRole('button', { name: 'Filters, 2 active' }).textContent).toContain('2');
  });

  it('reports the chosen sort mode', async () => {
    const onSortChange = vi.fn();
    render(<SelectionFilterToolbar {...toolbarProps({ onSortChange })} />);

    fireEvent.click(screen.getByRole('button', { name: /Sort by/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Grade: high to low' }));

    expect(onSortChange).toHaveBeenCalledWith('grade-desc');
  });

  it('renders one group per dimension with its real values', async () => {
    render(<SelectionFilterToolbar {...toolbarProps()} />);
    const dialog = await openFilters();

    expect(within(dialog).getByText('Grade')).toBeInTheDocument();
    expect(within(dialog).getByText('Verdict')).toBeInTheDocument();
    expect(within(dialog).getByText('Consideration')).toBeInTheDocument();
    expect(within(dialog).getByText('Insufficient quota')).toBeInTheDocument();
    expect(within(dialog).getByText('Show 24 candidates')).toBeInTheDocument();
  });

  it('shows the summary, the visible count and a disabled reset while the view is unrestricted', () => {
    render(<SelectionFilterToolbar {...toolbarProps()} />);

    expect(screen.getByText('24 of 24 candidates')).toBeInTheDocument();
    expect(screen.getAllByText('All')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeDisabled();
  });

  it('summarizes the criteria and enables the reset once the view changes', () => {
    const criteria = { ...createSelectionView(), grades: ['6', '1'], verdicts: ['rejected' as const] };
    render(<SelectionFilterToolbar {...toolbarProps({ criteria, summaryOptions: toSelectionViewSummary(criteria) })} />);

    expect(screen.getByText('1, 6')).toBeInTheDocument();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText('Consideration')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeEnabled();
  });

  it('separates the three groups with two separators, never a leading one', async () => {
    render(<SelectionFilterToolbar {...toolbarProps()} />);
    const dialog = await openFilters();

    expect(dialog.querySelectorAll('hr, [role="separator"]')).toHaveLength(3);
  });

  it('reports a group change with the plain values and never with the All sentinel', async () => {
    const onGroupChange = vi.fn();
    render(<SelectionFilterToolbar {...toolbarProps({ onGroupChange })} />);
    const dialog = await openFilters();

    fireEvent.click(within(dialog).getByText('1'));

    expect(onGroupChange).toHaveBeenCalledWith('grades', ['1']);
  });

  it('keeps an All click free of the sentinel so the dimension is unrestricted', async () => {
    const onGroupChange = vi.fn();
    const criteria = { ...createSelectionView(), grades: ['1'] };
    render(<SelectionFilterToolbar {...toolbarProps({ criteria, onGroupChange })} />);
    const dialog = await openFilters();

    fireEvent.click(within(dialog).getAllByText('All')[0]);

    expect(onGroupChange).toHaveBeenCalledWith('grades', []);
  });

  it('resets the whole view from the summary action', () => {
    const onResetView = vi.fn();
    const criteria = { ...createSelectionView(), sort: 'grade-desc' as const };
    render(<SelectionFilterToolbar {...toolbarProps({ criteria, onResetView })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));

    expect(onResetView).toHaveBeenCalledTimes(1);
  });

  it('exposes the current sort mode and its options without changing it on render', () => {
    const onSortChange = vi.fn();
    render(<SelectionFilterToolbar {...toolbarProps({ onSortChange })} />);

    expect(screen.getByRole('button', { name: /Sort by/ })).toHaveTextContent('Current order');
    expect(onSortChange).not.toHaveBeenCalled();
  });
});
