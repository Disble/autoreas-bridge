import type { ReactNode } from 'react';
import type { NotificationRow } from '../../../../shared/contracts/notification-center.types';

/**
 * Everything `NotificationTable` needs from its caller -- a fully dumb
 * render surface (CLAUDE.md frontend constraint #1). Pagination, sorting
 * defaults, and empty-state selection are all owned upstream by the sync
 * hook, the panel, and `NotificationEmptyState` respectively. Selection
 * (`selectionMode`/`selectedKeys`/`Checkbox slot="selection"`) is Slice 3b's
 * addition to this same component (design.md §9.2's row grid reserves the
 * leading 40px for it).
 */
export interface NotificationTableProps {
  readonly rows: readonly NotificationRow[];
  readonly isLoading: boolean;
  readonly hasNextPage: boolean;
  readonly onLoadMore: () => void;
  readonly renderEmptyState: () => ReactNode;
}
