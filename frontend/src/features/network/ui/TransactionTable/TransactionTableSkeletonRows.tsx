import { Skeleton } from '@heroui/react';
import type { ReactElement } from 'react';
import { TRANSACTION_TABLE_SKELETON_ROW_COUNT } from '../TransactionPanel/transaction-panel.constants';

/**
 * Builds the placeholder rows the transactions rail shows while the
 * transaction page is unresolved. These are PLAIN `<tr>` elements rendered
 * OUTSIDE the React Aria collection on purpose: while loading,
 * `TransactionTable` swaps the whole React Aria table for a plain placeholder
 * table instead of mounting these rows inside `Table.Body`.
 *
 * Why the placeholders can never be collection rows again: React Aria's
 * focus-fixup scan (`useGridState`, react-stately) walks the collection looking
 * for a row focus can move to, and its scan has NO iteration bound. When every
 * row of the collection is "skippable" - disabled, or a header row - its index
 * oscillates between two adjacent values forever. Placeholders built as
 * `Table.Row` with `isDisabled` were exactly that all-skippable collection, so
 * a focused row plus a reload wedged the renderer at 100% of a core with the
 * skeleton frozen on screen (2026-09-21 Activity freeze, captured live).
 *
 * The cells mirror the six real columns' widths so the table never resizes
 * once real rows land, and each placeholder row carries the real row's height
 * (`h-9`, 36px) so the content does not jump when data lands; the gate
 * `frontend/scripts/layout-fixtures/loading-skeletons-fixture.tsx` measures it.
 * @returns One plain `<tr>` per placeholder, with the fixed skeleton cell
 * markup shared by the placeholder table.
 */
export function buildTransactionTableSkeletonRows(): readonly ReactElement[] {
  return Array.from({ length: TRANSACTION_TABLE_SKELETON_ROW_COUNT }, (_unused, index) => (
    <tr data-testid="transaction-table-skeleton-row" key={index} className="h-9">
      <td>
        <Skeleton className="h-3.5 w-16 rounded" />
      </td>
      <td>
        <Skeleton className="h-5 w-14 rounded-full" />
      </td>
      <td>
        <Skeleton className="h-3.5 w-full rounded" />
      </td>
      <td>
        <Skeleton className="h-5 w-20 rounded-full" />
      </td>
      <td>
        <Skeleton className="h-5 w-12 rounded-full" />
      </td>
      <td>
        <Skeleton className="h-3.5 w-16 rounded" />
      </td>
    </tr>
  ));
}
