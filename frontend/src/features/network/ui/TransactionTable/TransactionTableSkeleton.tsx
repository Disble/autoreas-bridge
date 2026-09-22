import {
  TRANSACTION_TABLE_COLUMNS,
  type TransactionTableColumn,
} from './transaction-table.columns';
import { buildTransactionTableSkeletonRows } from './TransactionTableSkeletonRows';

/** One plain header cell of the transactions placeholder table, sized from the shared column source of truth. */
function TransactionTableSkeletonHeaderCell({ column }: { readonly column: TransactionTableColumn }): React.JSX.Element {
  return (
    <th className={column.widthClass} key={column.label} scope="col" role="columnheader">
      {column.label}
    </th>
  );
}

/**
 * The transactions rail's loading placeholder: a PLAIN HTML `<table>` rendered
 * INSTEAD of the HeroUI (React Aria) `Table` while `isLoading`, so no React
 * Aria collection exists on screen while the placeholder rows are shown.
 *
 * This is the guard for the React Aria focus-fixup invariant: placeholders are
 * never collection rows, because React Aria's `useGridState` fixup scan is
 * unbounded and an all-skippable (every row disabled) collection makes it
 * oscillate forever, wedging the renderer (2026-09-21 Activity freeze).
 *
 * The header mirrors the real table's six columns (same labels and width
 * classes, from `TRANSACTION_TABLE_COLUMNS`) and `aria-busy` keeps the busy
 * contract, so the rail keeps its height and announces loading the same way
 * the resolved table does. The header cells carry an explicit
 * `role="columnheader"` because the layout gate matches
 * `[role="columnheader"]`, a CSS attribute selector that does not match
 * `<th>`'s implicit role.
 * @returns The plain placeholder table element for the loading state.
 */
export function TransactionTableSkeleton(): React.JSX.Element {
  return (
    <table aria-busy="true" aria-label="Captured transactions" className="w-full table-fixed" data-testid="transaction-table-skeleton-table">
      <thead>
        <tr>
          {TRANSACTION_TABLE_COLUMNS.map((column) => (
            <TransactionTableSkeletonHeaderCell column={column} key={column.label} />
          ))}
        </tr>
      </thead>
      <tbody>{buildTransactionTableSkeletonRows()}</tbody>
    </table>
  );
}
