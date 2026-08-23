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
        hasNextPage={false}
        isLoading={false}
        onLoadMore={vi.fn()}
        renderEmptyState={() => <span>Empty</span>}
        rows={ROWS}
      />,
    );

    expect(screen.getByText('First notification')).toBeInTheDocument();
    expect(screen.getByText('Second notification')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3); // 2 data rows + 1 header row
  });

  it('sorts the "When" column descending by default, with no user interaction (task 3a.2.5)', () => {
    render(
      <NotificationTable
        hasNextPage={false}
        isLoading={false}
        onLoadMore={vi.fn()}
        renderEmptyState={() => <span>Empty</span>}
        rows={ROWS}
      />,
    );

    const whenColumnHeader = screen.getByRole('columnheader', { name: /when/i });
    expect(whenColumnHeader).toHaveAttribute('aria-sort', 'descending');
  });

  it('renders the caller-provided empty state when there are no rows', () => {
    render(
      <NotificationTable
        hasNextPage={false}
        isLoading={false}
        onLoadMore={vi.fn()}
        renderEmptyState={() => <span>Nothing here yet</span>}
        rows={[]}
      />,
    );

    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });
});
