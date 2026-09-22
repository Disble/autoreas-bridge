import { Table } from '@heroui/react';
import { ACTIVITY_RAIL_SCROLLER_CLASS } from '../ActivityView/activity-view.constants';
import { selectionKeysFor } from '../ActivityView/activity-view.helpers';
import {
  TRANSACTION_EMPTY_STATE_MESSAGE,
  TRANSACTION_LOADING_STATE_MESSAGE,
  TRANSACTION_TABLE_COLUMN_COUNT,
  TRANSACTION_TABLE_SPACER_BOTTOM_ID,
  TRANSACTION_TABLE_SPACER_TOP_ID,
  TRANSACTION_UPDATING_STATE_MESSAGE,
} from '../TransactionPanel/transaction-panel.constants';
import type { TransactionTableProps } from '../TransactionPanel/transaction-panel.types';
import { TransactionRow } from '../TransactionRow/TransactionRow';
import { TransactionTableSkeleton } from './TransactionTableSkeleton';
import { TRANSACTION_TABLE_COLUMNS } from './transaction-table.columns';

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
 * While `isLoading` — a rail with nothing to show yet — the ENTIRE React Aria
 * table is replaced by the plain `TransactionTableSkeleton` placeholder table:
 * the loading placeholders are plain `<tr>` elements that never enter a React
 * Aria collection. This is an invariant, not a preference — React Aria's
 * focus-fixup scan (`useGridState`, react-stately) has NO iteration bound, and
 * a collection in which EVERY row is skippable (disabled, or a header row)
 * makes that scan oscillate between two adjacent indices forever, wedging the
 * renderer with the skeleton frozen on screen (2026-09-21 Activity freeze,
 * captured live). While `isUpdating` — a settled filter query in flight while
 * rows are on screen — the rows stay mounted and only the busy state and the
 * announcement change; the skeleton is never a per-keystroke state. The
 * placeholder table keeps the same labels, column widths and `aria-busy`
 * contract so the rail never resizes across a reload. A `role="status"`
 * region cannot nest inside table markup, so the announcement sits as a
 * sibling of whichever table is mounted.
 */
export function TransactionTable({
  rows,
  selectedId,
  onSelect,
  isLoading,
  isUpdating,
  topSpacerHeightPx,
  bottomSpacerHeightPx,
  scrollRef,
}: Readonly<TransactionTableProps>) {
  // `isUpdating` keeps the rows on screen (the rail is only refreshing them),
  // so only `isLoading` — nothing to show yet — may swap them for the skeleton.
  const isBusy = isLoading || isUpdating;
  const statusMessage = isLoading ? TRANSACTION_LOADING_STATE_MESSAGE : TRANSACTION_UPDATING_STATE_MESSAGE;

  return (
    <div className={ACTIVITY_RAIL_SCROLLER_CLASS} data-transaction-scroll ref={scrollRef}>
      {isBusy ? (
        <div aria-labelledby="transaction-table-loading-label" aria-live="polite" className="sr-only" role="status">
          <span id="transaction-table-loading-label">{statusMessage}</span>
        </div>
      ) : null}
      {isLoading ? (
        /* The React Aria table is fully replaced while loading: the placeholders must never enter a collection. */
        <TransactionTableSkeleton />
      ) : (
        <Table aria-busy={isBusy} aria-label="Captured transactions" variant="secondary">
          <Table.ScrollContainer>
            <Table.Content
              aria-label="Captured transactions"
              className="w-full table-fixed"
              onSelectionChange={(keys) => {
                // `selectionMode="single"` can never deliver the `'all'` selection: React
                // Aria only produces it from select-all, which is gated on `multiple`
                // (react-aria useSelectableCollection), and no pointer interaction
                // produces it either. Every delivered value is a Set, so this handler
                // only ever forwards the one key of the pressed row.
                const [first] = [...keys];
                onSelect(String(first));
              }}
              selectedKeys={selectionKeysFor(selectedId)}
              selectionMode="single"
            >
              <Table.Header>
                {TRANSACTION_TABLE_COLUMNS.map((column, index) => (
                  <Table.Column className={column.widthClass} isRowHeader={index === 0} key={column.label}>
                    {column.label}
                  </Table.Column>
                ))}
              </Table.Header>
              <Table.Body
                renderEmptyState={() => <span className="text-sm text-default-400">{TRANSACTION_EMPTY_STATE_MESSAGE}</span>}
              >
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
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      )}
    </div>
  );
}
