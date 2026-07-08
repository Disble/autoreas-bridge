import type { ReactNode } from 'react';
import type { OrderingCard } from '../../../../infrastructure/season-source';

/** One anime's intended placement — a weekday+position or its Estrenos section. */
export interface DraftPlacement {
  readonly dia: string;
  readonly orden: number;
}

/** The seven weekday columns keyed by day name, each an ordered list of cards. */
export type WeekColumns = Record<string, readonly OrderingCard[]>;

/** The board's working state: the rail (awaiting placement) and the week columns. */
export interface WorkingState {
  readonly rail: readonly OrderingCard[];
  readonly columns: WeekColumns;
}

/** The slice of dnd-kit's droppable `data.current` a sortable item exposes. */
export interface SortableData {
  readonly sortable?: {
    readonly containerId: string;
    readonly index: number;
  };
}

/** Props for a single draggable ordering card (a rail candidate or a placed weekday clone). */
export interface SortableCardProps {
  readonly card: OrderingCard;
  /** The card's location: a weekday name, or RAIL for the awaiting-placement rail. */
  readonly location: string;
  readonly readOnly: boolean;
  /** False disables Delete — the anime's last card can never be removed. */
  readonly canRemove: boolean;
  /** Present on weekday clones: stages a logical copy to drag onto another day. */
  readonly onDuplicate?: () => void;
  readonly onRemove: () => void;
}

/** Props for a droppable column (a weekday, or the rail) that accepts dropped cards. */
export interface DroppableColumnProps {
  /** The dnd-kit droppable container id (a weekday name or RAIL_CONTAINER_ID). */
  readonly containerId: string;
  readonly className?: string;
  readonly children: ReactNode;
}
