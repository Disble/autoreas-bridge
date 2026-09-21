import { Table } from '@heroui/react';
import { ACTIVITY_RAIL_SCROLLER_CLASS } from '../ActivityView/activity-view.constants';
import {
  TRANSACTION_EMPTY_STATE_MESSAGE,
  TRANSACTION_LOADING_STATE_MESSAGE,
  TRANSACTION_TABLE_COLUMN_COUNT,
  TRANSACTION_TABLE_SPACER_BOTTOM_ID,
  TRANSACTION_TABLE_SPACER_TOP_ID,
} from '../TransactionPanel/transaction-panel.constants';
import type { TransactionTableProps } from '../TransactionPanel/transaction-panel.types';
import { TransactionRow } from '../TransactionRow/TransactionRow';
import { buildTransactionTableSkeletonRows } from './TransactionTableSkeletonRows';

/**
 * Dumb dense data grid rendering the virtualized transaction rows on HeroUI
 * Table (React Aria), DevTools-Network density. `rows` are exactly the rows
 * the virtual window reports in view; one spacer row above and one below
 * carry the unrendered height so the scrollbar stays honest while the mounted
 * row count stays bounded (ADR-012, live branch, virtualized). Selection is
 * driven entirely by props and lives in the store: a row may unmount once it
 * leaves the window, and the selection survives.
 *
 * The ref the virtual window hook hands down attaches to the outer container
 * because that is the element that actually scrolls: HeroUI's
 * `Table.ScrollContainer` constrains only the horizontal axis, so the vertical
 * `max-h` boundary is this div's. The virtualizer observes its rect and offset
 * directly — there is no `onScroll` handler and no load-more logic here.
 *
 * There is NO `Table.LoadMore` here. Load-more fires inside the window hook
 * when the virtual range reaches the last loaded row; a sentinel would rebuild
 * its IntersectionObserver on every collection change and feed itself pages.
 *
 * Each row is a memoized `TransactionRow` rather than inline JSX, so a
 * re-render of the table (a pushed capture, a selection, the next page) skips
 * the rows already mounted in the window.
 *
 * While `isLoading`, the header and column widths stay put and the body
 * swaps in skeleton rows instead of the real ones, so the table never resizes
 * once the page resolves. A `role="status"` region cannot nest inside table
 * markup, so the loading announcement sits as a sibling of the table and the
 * table itself is marked `aria-busy`.
 */
export function TransactionTable({
  rows,
  selectedId,
  onSelect,
  isLoading,
  topSpacerHeightPx,
  bottomSpacerHeightPx,
  scrollRef,
}: Readonly<TransactionTableProps>) {
  return (
    <div className={ACTIVITY_RAIL_SCROLLER_CLASS} data-transaction-scroll ref={scrollRef}>
      {isLoading ? (
        <div aria-labelledby="transaction-table-loading-label" aria-live="polite" className="sr-only" role="status">
          <span id="transaction-table-loading-label">{TRANSACTION_LOADING_STATE_MESSAGE}</span>
        </div>
      ) : null}
      <Table aria-busy={isLoading} aria-label="Captured transactions" variant="secondary">
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
              renderEmptyState={() => <span className="text-sm text-default-400">{TRANSACTION_EMPTY_STATE_MESSAGE}</span>}
            >
              {isLoading ? (
                buildTransactionTableSkeletonRows()
              ) : (
                <>
                  {rows.length > 0 ? (
                    <Table.Row
                      data-transaction-spacer="top"
                      id={TRANSACTION_TABLE_SPACER_TOP_ID}
                      style={{ height: topSpacerHeightPx }}
                    >
                      <Table.Cell colSpan={TRANSACTION_TABLE_COLUMN_COUNT} />
                    </Table.Row>
                  ) : null}
                  {rows.map((row) => (
                    <TransactionRow key={row.id} row={row} />
                  ))}
                  {rows.length > 0 ? (
                    <Table.Row
                      data-transaction-spacer="bottom"
                      id={TRANSACTION_TABLE_SPACER_BOTTOM_ID}
                      style={{ height: bottomSpacerHeightPx }}
                    >
                      <Table.Cell colSpan={TRANSACTION_TABLE_COLUMN_COUNT} />
                    </Table.Row>
                  ) : null}
                </>
              )}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </div>
  );
}
