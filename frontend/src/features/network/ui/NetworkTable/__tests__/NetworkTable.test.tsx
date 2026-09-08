import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NETWORK_TABLE_SKELETON_ROW_COUNT } from '../../NetworkPanel/network-panel.constants';
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
      <NetworkTable emptyMessage="No runtime events captured yet." isLoading onScroll={vi.fn()} onSelect={vi.fn()} rows={[]} selectedId={null} />,
    );

    expect(screen.getByRole('columnheader', { name: 'Domain' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Event' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="table"]')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status', { name: 'Loading persisted runtime events…' })).toBeInTheDocument();
    expect(screen.getAllByTestId('network-table-skeleton-row')).toHaveLength(NETWORK_TABLE_SKELETON_ROW_COUNT);
  });

  it('drops the busy flag, the status region and the placeholder once resolved', () => {
    const { container } = render(
      <NetworkTable emptyMessage="No runtime events captured yet." isLoading={false} onScroll={vi.fn()} onSelect={vi.fn()} rows={[row()]} selectedId={null} />,
    );

    expect(container.querySelector('[data-slot="table"]')).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('network-table-skeleton-row')).toHaveLength(0);
    expect(screen.getByText('syncing catalogue')).toBeInTheDocument();
  });

  it('renders only placeholder rows while loading, even with rows already accumulated in state', () => {
    // Rows accumulate and are never unmounted (ADR-012, live branch), so a
    // real refetch can set isLoading back to true while `rows` still holds
    // everything captured so far. This reproduces that exact prop shape.
    render(
      <NetworkTable emptyMessage="No runtime events captured yet." isLoading onScroll={vi.fn()} onSelect={vi.fn()} rows={[row()]} selectedId={null} />,
    );

    expect(screen.getAllByTestId('network-table-skeleton-row')).toHaveLength(NETWORK_TABLE_SKELETON_ROW_COUNT);
    expect(screen.queryByText('syncing catalogue')).not.toBeInTheDocument();
  });

  it('shows the empty-state message when resolved with no rows', () => {
    render(<NetworkTable emptyMessage="No runtime events captured yet." isLoading={false} onScroll={vi.fn()} onSelect={vi.fn()} rows={[]} selectedId={null} />);

    expect(screen.getByText('No runtime events captured yet.')).toBeInTheDocument();
  });

  it('calls onSelect with the row id when a row is clicked', () => {
    const onSelect = vi.fn();
    render(<NetworkTable emptyMessage="empty" isLoading={false} onScroll={vi.fn()} onSelect={onSelect} rows={[row()]} selectedId={null} />);

    screen.getByText('syncing catalogue').closest('tr')?.click();

    expect(onSelect).toHaveBeenCalledWith('event-1');
  });
});
