import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { triggerIntersectionObservers } from '../../../../../test/setup';
import type { NotificationCenterSource } from '../../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationListRequest, NotificationPage, NotificationRow } from '../../../../../shared/contracts/notification-center.types';
import { useNotificationCenterSync } from '../../NotificationCenterPanel/use-notification-center-sync';
import { NotificationTable } from '../NotificationTable';

afterEach(cleanup);

/** Rows returned per fetch, matching the sync hook's own page size. */
const PAGE_SIZE = 25;
/** Total conceptual rows the fake source ever recorded -- the DOM must never hold this many at once. */
const BACKING_COLLECTION_SIZE = 500;

/** Builds one fake notification row for the 500-row backing collection. */
function buildRow(id: number): NotificationRow {
  return {
    id,
    createdAtMs: 1_700_000_000_000 + id,
    title: `Notification ${id}`,
    body: '',
    level: 'info',
    source: 'download',
    actionCount: 0,
  };
}

/** A fake source paging through the 500-row backing collection by keyset offset cursor. */
function makeFakeSource(): NotificationCenterSource {
  const listNotifications = vi.fn((request: NotificationListRequest): Promise<NotificationPage> => {
    const offset = request.cursor === '' ? 0 : Number(request.cursor);
    const items = Array.from({ length: PAGE_SIZE }, (_, index) => buildRow(offset + index + 1)).filter(
      (row) => row.id <= BACKING_COLLECTION_SIZE,
    );
    const nextOffset = offset + PAGE_SIZE;
    return Promise.resolve({
      items,
      nextCursor: nextOffset < BACKING_COLLECTION_SIZE ? String(nextOffset) : undefined,
      appliedLimit: PAGE_SIZE,
      totalEver: BACKING_COLLECTION_SIZE,
      degraded: false,
    });
  });

  return {
    listNotifications,
    getNotification: vi.fn(),
    getUnreadCount: vi.fn(),
    markRead: vi.fn(),
    markUnread: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    executeAction: vi.fn(),
  };
}

/** Minimal harness wiring the sync hook straight into the dumb table, standing in for the not-yet-built panel. */
function NotificationTableHarness({ source }: Readonly<{ source: NotificationCenterSource }>) {
  const sync = useNotificationCenterSync({ source, unreadOnly: false, view: 'active' });

  return (
    <NotificationTable
      hasNextPage={sync.hasNextPage}
      isLoading={sync.isLoading}
      onLoadMore={sync.onLoadMore}
      onSelectionChange={vi.fn()}
      renderEmptyState={() => <span>Empty</span>}
      rows={sync.rows}
      selectedKeys={new Set()}
    />
  );
}

/** Counts real notification rows only, excluding the header row and the `Table.LoadMore` sentinel. */
function countDataRows() {
  // Every real data row's "Title" cell is `isRowHeader`, which is the only
  // reliable way to count actual rows: the header row AND the
  // `Table.LoadMore` sentinel row both also carry `role="row"`.
  return screen.getAllByRole('rowheader').length;
}

describe('NotificationTable progressive load (500-record backing collection)', () => {
  it('renders only the loaded page, then grows on load-more — never the whole backing collection', async () => {
    const source = makeFakeSource();
    render(<NotificationTableHarness source={source} />);

    await waitFor(() => expect(countDataRows()).toBe(PAGE_SIZE));

    // One load-more is enough to prove the window grows on demand rather than
    // merely starting small. A third page cost another full Table re-render
    // and pushed this past the 5s budget once it shared a worker with the
    // rest of the suite -- and raising that budget is what
    // `no-restricted-syntax` forbids here, since it hides the cost instead of
    // removing it. Poking inside the retry was worse still: every poll fired
    // another trigger, so contention made the test spin rather than wait.
    act(() => {
      triggerIntersectionObservers(true);
    });
    await waitFor(() => expect(countDataRows()).toBe(PAGE_SIZE * 2));

    // Still far below the full backing collection, which is the claim this
    // test exists to make.
    expect(countDataRows()).toBeLessThan(BACKING_COLLECTION_SIZE);
  });
});
