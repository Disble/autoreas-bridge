import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { OrderingBoard, SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import type { SeasonStoreState } from '../../../../shared/store/season-store/season-store.types';
import type { SeasonCoverThumbProps } from '../SeasonCoverThumb/season-cover-thumb.types';
import type { SeasonSectionId } from '../SeasonWorkspace/season-workspace.types';
import type { OrderingState } from '../../../../shared/ordering/ordering.types';
import type { AnimeScheduleOrderingInstance } from '../../../../shared/ordering/ui/AnimeScheduleOrdering/anime-schedule-ordering.types';

/** Props for the Ordering board's cross-section recovery action. */
export interface OrderingBoardProps {
  /** Navigates to another season workflow section. */
  readonly onNavigate: (section: SeasonSectionId) => void;
}

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
  /** The cover thumbnail props for an anime id. */
  readonly getCoverThumb: (animeId: string) => SeasonCoverThumbProps;
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
  /** Rich empty state shown instead of `emptyMessage` while the container holds no cards; `null` renders nothing at all. */
  readonly emptyState?: ReactNode;
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
  /** The cover thumbnail of this card's anime. */
  readonly cover: SeasonCoverThumbProps;
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
export type OrderingCardActionRowProps = Omit<OrderingItemProps, 'container' | 'index' | 'cover'>;

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

/** Season store values and actions consumed by the ordering board hook. */
export type OrderingBoardStoreBindings = Pick<
  SeasonStoreState,
  'closeSeason' | 'readOnly' | 'viewSeasonId' | 'seasonAnimes' | 'ensureAnimesLoaded' | 'errorMessage'
>;

/** Inputs of the hook that loads the live or stored board into the working state. */
export interface OrderingBoardLoadParams {
  /** The season source the board is read from. */
  readonly source: SeasonSource;
  /** The past season being viewed, or null for the live schedule. */
  readonly viewSeasonId: string | null;
}

/** What the board load hook holds and exposes to the ordering board hook. */
export interface OrderingBoardLoadResult {
  /** The last loaded board, the baseline the change count compares against. */
  readonly board: OrderingBoard;
  /** The editable working state. */
  readonly state: WorkingState;
  /** Replaces the working state (drag, duplicate, remove). */
  readonly setState: Dispatch<SetStateAction<WorkingState>>;
  /** True while the viewed past season's stored board is still unresolved. */
  readonly isHistoricalLoading: boolean;
  /** Whether the stored board exists; true for the live schedule. */
  readonly historicalRecorded: boolean;
  /** The failure message of the last stored-board read, when it failed. */
  readonly historicalError: string | undefined;
  /** Re-reads the board for the current view and resets the working state. */
  readonly load: () => Promise<void>;
}

/** Inputs of the hook that derives the board's render model from its working state. */
export interface OrderingBoardDerivedParams {
  /** The last loaded board. */
  readonly board: OrderingBoard;
  /** The editable working state. */
  readonly state: WorkingState;
  /** The season selection rows that card metadata is joined from. */
  readonly seasonAnimes: SeasonStoreState['seasonAnimes'];
}

/** The pure render model derived from the board's working state. */
export interface OrderingBoardDerived {
  /** Grade + desktop-action metadata keyed by anime id. */
  readonly meta: Readonly<Record<string, OrderingCardMeta>>;
  /** Every anime on the loaded board once, so each cover is resolved a single time. */
  readonly animeIds: readonly string[];
  /** The rail's cards, in board order. */
  readonly rail: readonly OrderingInstance[];
  /** Each weekday's cards, in board order. */
  readonly columns: Readonly<Record<string, readonly OrderingInstance[]>>;
  /** How many cards each anime holds. */
  readonly counts: Readonly<Record<string, number>>;
  /** How many placements differ from the loaded board. */
  readonly changeCount: number;
  /** How many cards sit on a weekday. */
  readonly scheduledCount: number;
  /** True when one anime holds two cards on the same weekday. */
  readonly hasInvalidWeekdayPlacements: boolean;
}

/** The anime page and folder desktop actions the ordering cards expose. */
export interface OrderingBoardDesktopActions {
  /** Opens the anime's page in the browser. */
  readonly onOpenPage: (animeId: string) => void;
  /** Copies the anime's page URL. */
  readonly onCopyPage: (animeId: string) => void;
  /** Opens the anime's download folder. */
  readonly onOpenFolder: (animeId: string) => void;
  /** Copies the anime's download folder path. */
  readonly onCopyFolder: (animeId: string) => void;
}
