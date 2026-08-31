import { Table } from '@heroui/react';
import {
  TRANSACTION_EMPTY_STATE_MESSAGE,
  TRANSACTION_LOADING_STATE_MESSAGE,
  TRANSACTION_TABLE_LOAD_MORE_LABEL,
} from '../TransactionPanel/transaction-panel.constants';
import type { TransactionTableProps } from '../TransactionPanel/transaction-panel.types';
import { TransactionRow } from '../TransactionRow/TransactionRow';

/**
 * Dumb dense data grid rendering the windowed transaction rows on HeroUI Table
 * (React Aria), DevTools-Network density. Selection and the load-more trigger
 * are driven entirely by props; rows accumulate and are never unmounted
 * (ADR-012, live branch).
 *
 * `Table.LoadMore` is React Aria's own near-bottom sentinel: it observes its
 * own intersection and raises `onLoadMore`, which reveals the next batch of
 * loaded rows or fetches the next cursor page. It is NOT a `Virtualizer` and
 * mounts no `ListLayout`.
 *
 * Each row is a memoized `TransactionRow` rather than inline JSX: with rows
 * accumulating and never unmounting, re-running every loaded row's markup on
 * every table render is the one cost that grows without bound here.
 */
export function TransactionTable({
  rows,
  selectedId,
  onSelect,
  isLoading,
  hasNextPage,
  onLoadMore,
}: Readonly<TransactionTableProps>) {
  return (
    <div className="max-h-[32rem] overflow-y-auto [scrollbar-gutter:stable] 2xl:max-h-[40rem]" data-transaction-scroll>
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
              {hasNextPage ? (
                <Table.LoadMore isLoading={isLoading} onLoadMore={onLoadMore}>
                  <Table.LoadMoreContent>{TRANSACTION_TABLE_LOAD_MORE_LABEL}</Table.LoadMoreContent>
                </Table.LoadMore>
              ) : null}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </div>
  );
}
