import { Skeleton, Table } from '@heroui/react';
import type { ReactElement } from 'react';
import type { ActivityOverviewSkeletonRowsProps } from './activity-overview.types';

/**
 * Builds the placeholder rows an ActivityOverview table renders as plain
 * `Table.Body` children while its aggregation is unresolved. One builder
 * covers both the request-health table and the three event-summary tables,
 * since they are the same plain count-table shape differing only in column
 * count and width — `columnWidths` carries that difference.
 *
 * This is a plain builder rather than a component invoked as `<X />`: React
 * Aria Components' static table collection walks the literal `Table.Row`
 * elements passed as `Table.Body` children, exactly like the `.map(...)`
 * branch it stands in for, so the placeholder must arrive pre-built the same
 * way.
 * @returns One `Table.Row` per placeholder, each disabled so a skeleton can
 * never be selected.
 */
export function buildActivityOverviewSkeletonRows({
  rowCount,
  columnWidths,
  testId,
  idPrefix,
}: Readonly<ActivityOverviewSkeletonRowsProps>): readonly ReactElement[] {
  return Array.from({ length: rowCount }, (_unused, rowIndex) => (
    <Table.Row data-testid={testId} id={`${idPrefix}-${rowIndex}`} isDisabled key={rowIndex}>
      {columnWidths.map((widthClass, columnIndex) => (
        <Table.Cell key={columnIndex}>
          <Skeleton className={`h-3.5 rounded ${widthClass}`} />
        </Table.Cell>
      ))}
    </Table.Row>
  ));
}

/**
 * Placeholder rows for the "Newest events" sample list, which is an ordinary
 * `<ul>` rather than a table and so needs its own shape: a timestamp, the
 * domain and level chips, and the message line.
 *
 * A component rather than a builder, unlike the table rows above — a plain
 * `<ul>` has no collection walker to satisfy, so the constraint that forced
 * builders on the tables does not apply here.
 */
export function ActivityOverviewSampleSkeletonRows({ rowCount }: Readonly<{ readonly rowCount: number }>) {
  return (
    <>
      {Array.from({ length: rowCount }, (_unused, rowIndex) => (
        <li className="flex min-w-0 items-center gap-2 text-[11px]" data-testid="activity-overview-sample-skeleton-row" key={rowIndex}>
          <Skeleton className="h-3 w-12 shrink-0 rounded" />
          <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
          <Skeleton className="h-5 w-12 shrink-0 rounded-full" />
          <Skeleton className="h-3 min-w-0 flex-1 rounded" />
        </li>
      ))}
    </>
  );
}
