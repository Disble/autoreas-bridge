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
      <NetworkTable
        bottomSpacerHeightPx={0}
        emptyMessage="No runtime events captured yet."
        isLoading
        onSelect={vi.fn()}
        rows={[]}
        scrollRef={vi.fn()}
        selectedId={null}
        topSpacerHeightPx={0}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Domain' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Event' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="table"]')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status', { name: 'Loading persisted runtime events…' })).toBeInTheDocument();
    expect(screen.getAllByTestId('network-table-skeleton-row')).toHaveLength(NETWORK_TABLE_SKELETON_ROW_COUNT);
  });

  it('drops the busy flag, the status region and the placeholder once resolved', () => {
    const { container } = render(
      <NetworkTable
        bottomSpacerHeightPx={0}
        emptyMessage="No runtime events captured yet."
        isLoading={false}
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
    // Rows accumulate and are never unmounted (ADR-012, live branch), so a
    // real refetch can set isLoading back to true while `rows` still holds
    // everything captured so far. This reproduces that exact prop shape.
    render(
      <NetworkTable
        bottomSpacerHeightPx={0}
        emptyMessage="No runtime events captured yet."
        isLoading
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

  it('shows the empty-state message when resolved with no rows', () => {
    render(
      <NetworkTable
        bottomSpacerHeightPx={0}
        emptyMessage="No runtime events captured yet."
        isLoading={false}
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

  it('renders the two virtual spacer rows spanning all five columns when the window is bounded', () => {
    render(
      <NetworkTable
        bottomSpacerHeightPx={144}
        emptyMessage="empty"
        isLoading={false}
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
