import { Table } from '@heroui/react';
import { ACTIVITY_RAIL_SCROLLER_CLASS } from '../ActivityView/activity-view.constants';
import {
  TRANSACTION_EMPTY_STATE_MESSAGE,
  TRANSACTION_LOADING_STATE_MESSAGE,
} from '../TransactionPanel/transaction-panel.constants';
import type { TransactionTableProps } from '../TransactionPanel/transaction-panel.types';
import { TransactionRow } from '../TransactionRow/TransactionRow';

/**
 * Dumb dense data grid rendering the windowed transaction rows on HeroUI Table
 * (React Aria), DevTools-Network density. Selection and the scroll-near-bottom
 * trigger are driven entirely by props; rows accumulate and are never unmounted
 * (ADR-012, live branch).
 *
 * `onScroll` sits on the outer container because that is the element that
 * actually scrolls: HeroUI's `Table.ScrollContainer` constrains only the
 * horizontal axis, so the vertical `max-h` boundary is this div's. It mirrors
 * `NetworkTable` deliberately — two rails, one trigger mechanism.
 *
 * There is NO `Table.LoadMore` here. That sentinel rebuilds its
 * IntersectionObserver on every collection change and counts itself visible up
 * to a full container height below the fold, so on a rail that appends the page
 * it just fetched it fed itself the next one until the cursor ran out. A scroll
 * event only ever comes from the user.
 *
 * Each row is a memoized `TransactionRow` rather than inline JSX: with rows
 * accumulating and never unmounting, re-running every loaded row's markup on
 * every table render is the one cost that grows without bound here.
 */
export function TransactionTable({ rows, selectedId, onSelect, isLoading, onScroll }: Readonly<TransactionTableProps>) {
  return (
    <div
      className={ACTIVITY_RAIL_SCROLLER_CLASS}
      data-transaction-scroll
      onScroll={onScroll}
    >
      <Table aria-label="Captured transactions" variant="secondary">
        <Table.ScrollContainer>
          <Table.Content
            aria-label="Captured transactions"
            className="w-full table-fixed"
            onSelectionChange={(keys) => {
              if (keys === 'all') {
                return;
              }

              const [first] = keys;
              onSelect(String(first));
            }}
            selectedKeys={selectedId === null ? [] : [selectedId]}
            selectionMode="single"
          >
            <Table.Header>
              <Table.Column className="w-[92px]" isRowHeader>
                Time
              </Table.Column>
              <Table.Column className="w-[96px]">Method</Table.Column>
              <Table.Column>Route</Table.Column>
              <Table.Column className="w-[104px]">Outcome</Table.Column>
              <Table.Column className="w-[88px]">Status</Table.Column>
              <Table.Column className="w-[104px]">Duration</Table.Column>
            </Table.Header>
            <Table.Body
              renderEmptyState={() => (
                <span className="text-sm text-default-400">
                  {isLoading ? TRANSACTION_LOADING_STATE_MESSAGE : TRANSACTION_EMPTY_STATE_MESSAGE}
                </span>
              )}
            >
              {rows.map((row) => (
                <TransactionRow key={row.id} row={row} />
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </div>
  );
}
