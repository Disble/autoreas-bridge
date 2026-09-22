import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NETWORK_LOADING_STATE_MESSAGE,
  NETWORK_TABLE_SKELETON_ROW_COUNT,
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

/**
 * Loading placeholders must never be React Aria collection rows.
 *
 * React Aria's focus-fixup scan (`useGridState`, react-stately) walks the
 * collection looking for a row focus can move to, and it has no iteration bound:
 * when every row of the collection is "skippable" - disabled, or a header row -
 * its index oscillates between two adjacent values forever. A collection in
 * which EVERY row is disabled is exactly what the loading placeholders used to
 * build (each placeholder carried `isDisabled`), so a focused row plus a reload
 * wedged the renderer at 100% of a core with the skeleton frozen on screen
 * (2026-09-21 Activity freeze, captured live).
 *
 * The placeholders therefore render outside the collection. These assertions
 * fail if anyone puts them back inside it, which is the whole guard: the loop
 * itself cannot be asserted directly, because a synchronous infinite loop hangs
 * the test runner instead of failing it.
 */
describe('NetworkTable loading placeholders', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the placeholders outside the React Aria collection while loading', () => {
    const { container } = render(
      <NetworkTable
        bottomSpacerHeightPx={144}
        emptyMessage="No runtime events captured yet."
        isLoading
        isUpdating={false}
        onSelect={vi.fn()}
        rows={[row()]}
        scrollRef={vi.fn()}
        selectedId="event-1"
        topSpacerHeightPx={72}
      />,
    );

    expect(screen.getAllByTestId('network-table-skeleton-row')).toHaveLength(NETWORK_TABLE_SKELETON_ROW_COUNT);
    // The trap: no React Aria table (and therefore no collection) may exist while
    // the placeholders are on screen, because every placeholder row is skippable.
    expect(container.querySelector('[data-slot="table"]')).toBeNull();
  });

  it('keeps the loading announcement and the busy contract on the placeholder surface', () => {
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

    expect(screen.getByRole('status', { name: NETWORK_LOADING_STATE_MESSAGE })).toBeInTheDocument();
    expect(container.querySelector('[data-network-scroll] [aria-busy="true"]')).not.toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Event' })).toBeInTheDocument();
  });

  it('mounts the React Aria table again once the rows resolve', () => {
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

    expect(container.querySelector('[data-slot="table"]')).not.toBeNull();
    expect(screen.queryAllByTestId('network-table-skeleton-row')).toHaveLength(0);
    expect(screen.getByText('syncing catalogue')).toBeInTheDocument();
  });
});
