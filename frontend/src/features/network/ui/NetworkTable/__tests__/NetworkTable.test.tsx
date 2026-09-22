import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NETWORK_LOADING_STATE_MESSAGE,
  NETWORK_TABLE_SKELETON_ROW_COUNT,
  NETWORK_UPDATING_STATE_MESSAGE,
} from '../../NetworkPanel/network-panel.constants';
import type { NetworkEntryViewModel } from '../../NetworkPanel/network-panel.types';
import { NetworkTable } from '../NetworkTable';

/** Builds one presentation-ready runtime-event row, overridable field by field per test. */
function row(overrides: Partial<NetworkEntryViewModel> = {}): NetworkEntryViewModel {
  return {
    id: 'event-1',
    timeLabel: '10:30:45',
    domain: 'anime',
    level: 'info',
    message: 'syncing catalogue',
    statusLabel: '—',
    durationLabel: '12ms',
    ...overrides,
  };
}

describe('NetworkTable', () => {
  afterEach(() => {
    cleanup();
  });

  it('keeps the column headers, marks the table busy, names the load and renders placeholder rows while loading', () => {
    const { container } = render(
      <NetworkTable
        bottomSpacerHeightPx={0}
        emptyMessage="No runtime events captured yet."
        isLoading
        isUpdating={false}
        onSelect={vi.fn()}
        rows={[]}
        scrollRef={vi.fn()}
        selectedId={null}
        topSpacerHeightPx={0}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Domain' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Event' })).toBeInTheDocument();
    expect(container.querySelector('[data-testid="network-table-skeleton-table"]')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status', { name: 'Loading persisted runtime events…' })).toBeInTheDocument();
    expect(screen.getAllByTestId('network-table-skeleton-row')).toHaveLength(NETWORK_TABLE_SKELETON_ROW_COUNT);
  });

  it('drops the busy flag, the status region and the placeholder once resolved', () => {
    const { container } = render(
      <NetworkTable
        bottomSpacerHeightPx={0}
        emptyMessage="No runtime events captured yet."
        isLoading={false}
        isUpdating={false}
        onSelect={vi.fn()}
        rows={[row()]}
        scrollRef={vi.fn()}
        selectedId={null}
        topSpacerHeightPx={0}
      />,
    );

    expect(container.querySelector('[data-slot="table"]')).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('network-table-skeleton-row')).toHaveLength(0);
    expect(screen.getByText('syncing catalogue')).toBeInTheDocument();
  });

  it('renders only placeholder rows while loading, even with rows already accumulated in state', () => {
    // The panel derives `isLoading` as "nothing to show yet", so through the
    // composition root this prop shape only occurs on a first load. The
    // component contract stands on its own: the skeleton appears ONLY while
    // `isLoading`, and never while `isUpdating`.
    render(
      <NetworkTable
        bottomSpacerHeightPx={0}
        emptyMessage="No runtime events captured yet."
        isLoading
        isUpdating={false}
        onSelect={vi.fn()}
        rows={[row()]}
        scrollRef={vi.fn()}
        selectedId={null}
        topSpacerHeightPx={0}
      />,
    );

    expect(screen.getAllByTestId('network-table-skeleton-row')).toHaveLength(NETWORK_TABLE_SKELETON_ROW_COUNT);
    expect(screen.queryByText('syncing catalogue')).not.toBeInTheDocument();
  });

  it('keeps the rows on screen, busy and announced, while a settled filter query updates them — never a skeleton', () => {
    // `isUpdating` is the settled-filter-in-flight state: the previous rows
    // stay mounted, the table goes busy, the announcement fires, and the
    // skeleton must not swap the rows out.
    const { container } = render(
      <NetworkTable
        bottomSpacerHeightPx={0}
        emptyMessage="No runtime events captured yet."
        isLoading={false}
        isUpdating
        onSelect={vi.fn()}
        rows={[row()]}
        scrollRef={vi.fn()}
        selectedId={null}
        topSpacerHeightPx={0}
      />,
    );

    expect(container.querySelector('[data-slot="table"]')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status', { name: NETWORK_UPDATING_STATE_MESSAGE })).toBeInTheDocument();
    expect(screen.getByText('syncing catalogue')).toBeInTheDocument();
    expect(screen.queryAllByTestId('network-table-skeleton-row')).toHaveLength(0);
  });

  it('shows the empty-state message when resolved with no rows', () => {
    render(
      <NetworkTable
        bottomSpacerHeightPx={0}
        emptyMessage="No runtime events captured yet."
        isLoading={false}
        isUpdating={false}
        onSelect={vi.fn()}
        rows={[]}
        scrollRef={vi.fn()}
        selectedId={null}
        topSpacerHeightPx={0}
      />,
    );

    expect(screen.getByText('No runtime events captured yet.')).toBeInTheDocument();
  });

  it('calls onSelect with the row id when a row is clicked', () => {
    const onSelect = vi.fn();
    render(
      <NetworkTable
        bottomSpacerHeightPx={0}
        emptyMessage="empty"
        isLoading={false}
        isUpdating={false}
        onSelect={onSelect}
        rows={[row()]}
        scrollRef={vi.fn()}
        selectedId={null}
        topSpacerHeightPx={0}
      />,
    );

    screen.getByText('syncing catalogue').closest('tr')?.click();

    expect(onSelect).toHaveBeenCalledWith('event-1');
  });

  it('stripes each events row with the accent border its level resolves to', () => {
    // Two DIFFERENT levels in one render: a hard-coded single class (or the
    // accent call dropped entirely) cannot satisfy both exact strings, which
    // are the ones `getNetworkLevelAccentBorderClass` returns for info/error.
    render(
      <NetworkTable
        bottomSpacerHeightPx={0}
        emptyMessage="empty"
        isLoading={false}
        isUpdating={false}
        onSelect={vi.fn()}
        rows={[
          row({ id: 'event-1', level: 'info', message: 'info event' }),
          row({ id: 'event-2', level: 'error', message: 'error event' }),
        ]}
        scrollRef={vi.fn()}
        selectedId={null}
        topSpacerHeightPx={0}
      />,
    );

    expect(screen.getByText('info event').closest('tr')).toHaveClass('border-l-2', 'border-l-success');
    expect(screen.getByText('error event').closest('tr')).toHaveClass('border-l-2', 'border-l-danger');
  });

  it('marks only the Time column as the row header: exactly one rowheader cell per rendered body row', () => {
    // React Aria renders `role="rowheader"` on the CELLS of the `isRowHeader`
    // column — one per body row, the two virtual spacers included — never on
    // the column headers themselves. Marking every column (or every column but
    // Time) as the row header multiplies the count and swaps the cell text to
    // the wrong columns, so the exact shape below kills both mutants.
    render(
      <NetworkTable
        bottomSpacerHeightPx={144}
        emptyMessage="empty"
        isLoading={false}
        isUpdating={false}
        onSelect={vi.fn()}
        rows={[row(), row({ id: 'event-2', message: 'second event' })]}
        scrollRef={vi.fn()}
        selectedId={null}
        topSpacerHeightPx={72}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Time' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Domain' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Level' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Event' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Duration' })).toBeInTheDocument();
    const rowheaders = screen.getAllByRole('rowheader');
    expect(rowheaders).toHaveLength(4);
    expect(rowheaders.map((cell) => cell.textContent)).toEqual(['', '10:30:45', '10:30:45', '']);
  });

  it('selects exactly the row whose id is selected and leaves every other row unselected', () => {
    render(
      <NetworkTable
        bottomSpacerHeightPx={0}
        emptyMessage="empty"
        isLoading={false}
        isUpdating={false}
        onSelect={vi.fn()}
        rows={[row(), row({ id: 'event-2', message: 'second event' })]}
        scrollRef={vi.fn()}
        selectedId="event-1"
        topSpacerHeightPx={0}
      />,
    );

    expect(screen.getByText('syncing catalogue').closest('tr')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('second event').closest('tr')).toHaveAttribute('aria-selected', 'false');
    expect(document.querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
  });

  it('leaves no row selected while the selection is cleared', () => {
    render(
      <NetworkTable
        bottomSpacerHeightPx={0}
        emptyMessage="empty"
        isLoading={false}
        isUpdating={false}
        onSelect={vi.fn()}
        rows={[row()]}
        scrollRef={vi.fn()}
        selectedId={null}
        topSpacerHeightPx={0}
      />,
    );

    expect(document.querySelectorAll('[aria-selected="true"]')).toHaveLength(0);
    expect(screen.getByText('syncing catalogue').closest('tr')).toHaveAttribute('aria-selected', 'false');
  });

  it('renders the two virtual spacer rows spanning all five columns when the window is bounded', () => {
    render(
      <NetworkTable
        bottomSpacerHeightPx={144}
        emptyMessage="empty"
        isLoading={false}
        isUpdating={false}
        onSelect={vi.fn()}
        rows={[row(), row({ id: 'event-2', message: 'second event' })]}
        scrollRef={vi.fn()}
        selectedId={null}
        topSpacerHeightPx={72}
      />,
    );

    const top = document.querySelector<HTMLElement>('[data-network-spacer="top"]');
    const bottom = document.querySelector<HTMLElement>('[data-network-spacer="bottom"]');

    expect(top).not.toBeNull();
    expect(bottom).not.toBeNull();
    expect(top?.style.height).toBe('72px');
    expect(bottom?.style.height).toBe('144px');
    expect(top?.querySelector('td')).toHaveAttribute('colspan', '5');
    // Both real rows stayed mounted between the spacers.
    expect(screen.getByText('syncing catalogue')).toBeInTheDocument();
    expect(screen.getByText('second event')).toBeInTheDocument();
  });
});
