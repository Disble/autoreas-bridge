import { Skeleton, Table } from '@heroui/react';
import type { ReactElement } from 'react';
import { NETWORK_TABLE_SKELETON_ROW_COUNT } from '../NetworkPanel/network-panel.constants';

/**
 * Builds the placeholder rows `NetworkTable` renders as plain `Table.Body`
 * children while the runtime-event page is unresolved, mirroring the five
 * real columns' widths so the table never resizes once real rows land.
 *
 * This is a plain builder rather than a component invoked as `<X />`: React
 * Aria Components' static table collection walks the literal `Table.Row`
 * elements passed as `Table.Body` children, exactly like the `rows.map(...)`
 * branch it stands in for, so the placeholder must arrive pre-built the same
 * way.
 * @returns One `Table.Row` per placeholder, each disabled so a skeleton can
 * never be selected.
 */
export function buildNetworkTableSkeletonRows(): readonly ReactElement[] {
  return Array.from({ length: NETWORK_TABLE_SKELETON_ROW_COUNT }, (_unused, index) => (
    <Table.Row data-testid="network-table-skeleton-row" id={`network-table-skeleton-${index}`} isDisabled key={index}>
      <Table.Cell>
        <Skeleton className="h-3.5 w-16 rounded" />
      </Table.Cell>
      <Table.Cell>
        <Skeleton className="h-3.5 w-20 rounded-full" />
      </Table.Cell>
      <Table.Cell>
        <Skeleton className="h-3.5 w-16 rounded-full" />
      </Table.Cell>
      <Table.Cell>
        <Skeleton className="h-3.5 w-full rounded" />
      </Table.Cell>
      <Table.Cell>
        <Skeleton className="h-3.5 w-16 rounded" />
      </Table.Cell>
    </Table.Row>
  ));
}
