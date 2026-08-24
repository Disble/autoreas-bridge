import type { Table } from '@heroui/react';
import type { ReactNode } from 'react';
import type { NotificationRow } from '../../../../shared/contracts/notification-center.types';

/**
 * The `selectedKeys` prop shape React Aria hands `Table.Content`, derived
 * from HeroUI's own `Table['ContentProps']` (mirroring how
 * `NOTIFICATION_TABLE_DEFAULT_SORT` already derives `sortDescriptor`'s type
 * the same way, rather than importing `react-aria-components` directly).
 * This is the WIDER input shape (`'all' | Iterable<Key>`) React Aria allows
 * for a controlled value.
 */
export type NotificationTableSelectionKeys = Table['ContentProps']['selectedKeys'];

/** The `onSelectionChange` callback shape `Table.Content` hands the caller. */
export type NotificationTableSelectionChange = NonNullable<Table['ContentProps']['onSelectionChange']>;

/**
 * The NARROWER `'all' | Set<Key>` shape `onSelectionChange` actually hands
 * back, and what a caller's own selection state should be typed as (a
 * narrower type is always assignable to the wider `selectedKeys` prop).
 */
export type NotificationTableSelection = Parameters<NotificationTableSelectionChange>[0];

/**
 * Everything `NotificationTable` needs from its caller -- a fully dumb
 * render surface (CLAUDE.md frontend constraint #1). Pagination, sorting
 * defaults, and empty-state selection are all owned upstream by the sync
 * hook, the panel, and `NotificationEmptyState` respectively. Selection
 * state (`selectedKeys`/`onSelectionChange`) is owned by
 * `useNotificationSelection` (Slice 3b) -- this component only wires
 * `selectionMode="multiple"` and the `Checkbox slot="selection"` cells
 * design.md §9.2's row grid reserves the leading 40px for.
 */
export interface NotificationTableProps {
  readonly rows: readonly NotificationRow[];
  readonly isLoading: boolean;
  readonly hasNextPage: boolean;
  readonly onLoadMore: () => void;
  readonly renderEmptyState: () => ReactNode;
  readonly selectedKeys: NotificationTableSelectionKeys;
  readonly onSelectionChange: NotificationTableSelectionChange;
}
