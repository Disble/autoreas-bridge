import type { ReactNode } from 'react';
import type { CONTAINERS, WEEKDAYS } from './ordering-board.constants';

/** Known dnd-kit container ids for the ordering board: rail + weekdays. */
export type ContainerId = (typeof CONTAINERS)[number];

/** One real weekday column id. */
export type Weekday = (typeof WEEKDAYS)[number];

/** One anime's intended placement — a weekday+position or its Estrenos section. */
export interface DraftPlacement {
  readonly dia: string;
  readonly orden: number;
}

/**
 * One card instance on the board — a single placement of an anime. Multi-day clones
 * of the same anime share `animeId` but each has a distinct, stable `key` (the
 * dnd-kit sortable id). `orden` is only meaningful for a rail card's Estrenos section.
 */
export interface OrderingInstance {
  readonly key: string;
  readonly animeId: string;
  readonly name: string;
  readonly isPendingDuplicate: boolean;
  readonly section: string;
  readonly orden: number;
  readonly isNewcomer: boolean;
}

/**
 * The board's working state: per-container ordered instance keys (the shape `move`
 * from @dnd-kit/helpers reorders) plus the instance lookup by key.
 */
export interface WorkingState {
  readonly order: Record<string, readonly string[]>;
  readonly instances: Record<string, OrderingInstance>;
}

/** Props for a single draggable ordering card (a rail candidate or a placed weekday clone). */
export interface OrderingItemProps {
  readonly instance: OrderingInstance;
  /** The dnd-kit container id this card currently lives in (a weekday or RAIL_CONTAINER_ID). */
  readonly container: string;
  readonly index: number;
  /** Weekday clones show their "N." order prefix; rail cards do not. */
  readonly showOrder: boolean;
  readonly readOnly: boolean;
  /** False disables Delete — the anime's last card can never be removed. */
  readonly canRemove: boolean;
  /** Present on weekday clones: stages a logical copy to drag onto another day. */
  readonly onDuplicate?: () => void;
  readonly onRemove: () => void;
}

/** Props for a droppable column (a weekday, or the rail) that accepts dropped cards. */
export interface OrderingColumnProps {
  /** The dnd-kit droppable container id (a weekday name or RAIL_CONTAINER_ID). */
  readonly containerId: string;
  readonly className?: string;
  readonly children: ReactNode;
}
