import type { ReactNode } from 'react';
import type { OrderingState } from '../../../../shared/ordering/ordering.types';
import type { AnimeScheduleOrderingInstance } from '../../../../shared/ordering/ui/AnimeScheduleOrdering/anime-schedule-ordering.types';

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
export interface OrderingInstance extends AnimeScheduleOrderingInstance {
  readonly isPendingDuplicate: boolean;
  readonly section: string;
  readonly orden: number;
  readonly isNewcomer: boolean;
}

/**
 * Per-anime metadata joined onto ordering cards from the season selection model:
 * the approval grade plus the desktop-action affordances (source page / download
 * folder). Keyed by `animeId`, so every clone of the same anime shows the same
 * grade and actions.
 */
export interface OrderingCardMeta {
  readonly grade: number;
  readonly hasPage: boolean;
  readonly hasFolder: boolean;
  readonly pageUrl: string;
  readonly folderPath: string;
}

/**
 * Which board the hook currently holds: the live schedule, or one past season's
 * stored closure snapshot. The pair is what lets the hook tell "still reading
 * this season's record" from "the record for this season is loaded" without a
 * separate loading flag that a fast switch could leave stale.
 */
export interface OrderingBoardOrigin {
  /** The past season whose stored board was read; null when the board is the live schedule. */
  readonly seasonId: string | null;
  /** Whether the stored snapshot exists; only meaningful when `seasonId` is set. */
  readonly recorded: boolean;
}

/**
 * The board's working state: the shared ordering state specialized to Season's
 * richer card. Declaring it as `OrderingState<OrderingInstance>` rather than a
 * lookalike interface is what lets the shared transitions return Season's own
 * type — before this, every call through them needed an `as WorkingState` cast
 * that discarded and re-asserted the extra fields.
 */
export type WorkingState = OrderingState<OrderingInstance>;

/** The card actions and metadata every ordering container hands down to its cards. */
interface OrderingCardActions {
  /** True on a past or applied season: cards are locked and their actions disabled. */
  readonly readOnly: boolean;
  /** Grade plus desktop-action metadata per anime id; absent entries render a bare card. */
  readonly meta: Readonly<Record<string, OrderingCardMeta>>;
  /** How many cards each anime holds, so the last one can never be removed. */
  readonly counts: Readonly<Record<string, number>>;
  /** Adds another card for the anime to the rail. */
  readonly onDuplicate: (animeId: string) => void;
  /** Removes one card by its instance key. */
  readonly onRemove: (key: string) => void;
  /** Opens the anime's page in the browser. */
  readonly onOpenPage: (animeId: string) => void;
  /** Copies the anime's page URL. */
  readonly onCopyPage: (animeId: string) => void;
  /** Opens the anime's download folder. */
  readonly onOpenFolder: (animeId: string) => void;
  /** Copies the anime's download folder path. */
  readonly onCopyFolder: (animeId: string) => void;
}

/** Props for one droppable ordering container (and its lane): the rail, or one weekday column. */
export interface OrderingContainerProps extends OrderingCardActions {
  /** The dnd-kit droppable container id (a weekday name or `RAIL_CONTAINER_ID`). */
  readonly containerId: string;
  /** The lane heading, which also names the drop zone: the weekday, or the rail's title. */
  readonly label: string;
  /** Layout of the card list: a weekday's vertical stack, or the rail's wrapping grid. */
  readonly listClassName: string;
  /** Copy shown inside the container while it holds no cards. */
  readonly emptyMessage: string;
  /** True on weekday lanes: newcomer cards carry the muted New tag. Every rail card is a newcomer, so the rail never does. */
  readonly showNewcomerTag: boolean;
  /** The cards this container holds, in board order. */
  readonly cards: readonly OrderingInstance[];
}

/** Props for one ordering container's ordered list of draggable cards. */
export interface OrderingCardListProps extends OrderingCardActions {
  /** The dnd-kit container id the cards live in (a weekday or `RAIL_CONTAINER_ID`). */
  readonly container: string;
  /** Layout classes of the list element. */
  readonly className: string;
  /** Whether newcomer cards show the muted New tag (weekday lanes only). */
  readonly showNewcomerTag: boolean;
  /** The cards to render, in board order. */
  readonly cards: readonly OrderingInstance[];
}

/** Props for a single draggable ordering card (a rail candidate or a placed weekday clone). */
export interface OrderingItemProps {
  /** The card being rendered. */
  readonly instance: OrderingInstance;
  /** The dnd-kit container id this card currently lives in (a weekday or RAIL_CONTAINER_ID). */
  readonly container: string;
  /** The card's sortable position within its container. */
  readonly index: number;
  /** True when the board is locked: no drag, Duplicate or Remove. */
  readonly readOnly: boolean;
  /** Whether a newcomer card shows the muted New tag (weekday lanes only). */
  readonly showNewcomerTag: boolean;
  /** False disables Delete — the anime's last card can never be removed. */
  readonly canRemove: boolean;
  /** Grade + desktop-action metadata for this card's anime; absent when unavailable. */
  readonly meta?: OrderingCardMeta;
  /** Stages a logical copy of this card's anime to drag onto another day (rail and weekday cards alike). */
  readonly onDuplicate: () => void;
  /** Removes this card. */
  readonly onRemove: () => void;
  /** Opens the anime's page in the browser. */
  readonly onOpenPage: (animeId: string) => void;
  /** Copies the anime's page URL. */
  readonly onCopyPage: (animeId: string) => void;
  /** Opens the anime's download folder. */
  readonly onOpenFolder: (animeId: string) => void;
  /** Copies the anime's download folder path. */
  readonly onCopyFolder: (animeId: string) => void;
}

/** Props for the always-visible action row of one ordering card. */
export type OrderingCardActionRowProps = Omit<OrderingItemProps, 'container' | 'index'>;

/** Props for a droppable column (a weekday, or the rail) that accepts dropped cards. */
export interface OrderingColumnProps {
  /** The dnd-kit droppable container id (a weekday name or RAIL_CONTAINER_ID). */
  readonly containerId: string;
  /** Accessible name of the drop zone (the weekday, or the rail's title). */
  readonly label: string;
  /** Extra classes for the drop zone. */
  readonly className?: string;
  /** The zone's content: its card list or empty state. */
  readonly children: ReactNode;
}
