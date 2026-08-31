import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationRow } from '../../../../../shared/contracts/notification-center.types';
import { NotificationTable } from '../NotificationTable';

afterEach(cleanup);

/** Two fixture rows shared across every render assertion below. */
const ROWS: readonly NotificationRow[] = [
  { id: 1, createdAtMs: 1_700_000_000_000, title: 'First notification', body: '', level: 'info', source: 'download', actionCount: 0 },
  { id: 2, createdAtMs: 1_700_000_100_000, title: 'Second notification', body: '', level: 'warning', source: 'season', actionCount: 0 },
];

describe('NotificationTable', () => {
  it('renders every provided row', () => {
    render(
      <NotificationTable
        onScroll={vi.fn()}
        onSelectionChange={vi.fn()}
        renderEmptyState={() => <span>Empty</span>}
        rows={ROWS}
        selectedKeys={new Set()}
      />,
    );

    expect(screen.getByText('First notification')).toBeInTheDocument();
    expect(screen.getByText('Second notification')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3); // 2 data rows + 1 header row
  });

  it('sorts the "When" column descending by default, with no user interaction (task 3a.2.5)', () => {
    render(
      <NotificationTable
        onScroll={vi.fn()}
        onSelectionChange={vi.fn()}
        renderEmptyState={() => <span>Empty</span>}
        rows={ROWS}
        selectedKeys={new Set()}
      />,
    );

    const whenColumnHeader = screen.getByRole('columnheader', { name: /when/i });
    expect(whenColumnHeader).toHaveAttribute('aria-sort', 'descending');
  });

  it('renders the caller-provided empty state when there are no rows', () => {
    render(
      <NotificationTable
        onScroll={vi.fn()}
        onSelectionChange={vi.fn()}
        renderEmptyState={() => <span>Nothing here yet</span>}
        rows={[]}
        selectedKeys={new Set()}
      />,
    );

    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('renders one selection checkbox per data row plus a "select all" checkbox in the header (task 3b.1.5)', () => {
    render(
      <NotificationTable
        onScroll={vi.fn()}
        onSelectionChange={vi.fn()}
        renderEmptyState={() => <span>Empty</span>}
        rows={ROWS}
        selectedKeys={new Set()}
      />,
    );

    // 2 data rows + 1 header "select all" checkbox.
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  it('marks a row selected when its id is present in selectedKeys', () => {
    render(
      <NotificationTable
        onScroll={vi.fn()}
        onSelectionChange={vi.fn()}
        renderEmptyState={() => <span>Empty</span>}
        rows={ROWS}
        selectedKeys={new Set([1])}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    // The first checkbox is the header "select all"; row order after that
    // follows ROWS' order (id 1, then id 2).
    expect(checkboxes[1]?.checked).toBe(true);
    expect(checkboxes[2]?.checked).toBe(false);
  });

  it('forwards a row toggle to onSelectionChange', () => {
    const onSelectionChange = vi.fn();
    render(
      <NotificationTable
        onScroll={vi.fn()}
        onSelectionChange={onSelectionChange}
        renderEmptyState={() => <span>Empty</span>}
        rows={ROWS}
        selectedKeys={new Set()}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes[1]?.click();

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onSelectionChange.mock.calls[0]?.[0]).toBeInstanceOf(Set);
    expect([...(onSelectionChange.mock.calls[0]?.[0] as Set<number>)]).toEqual([1]);
  });
});
