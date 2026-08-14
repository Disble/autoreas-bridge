import type { DragOverEvent } from '@dnd-kit/react';

/**
 * The minimum an ordering card must expose for the shared state machine to work:
 * a stable dnd-kit sortable id (`key`) and the anime it is a placement of
 * (`animeId`). Several cards may share an `animeId` — that is what a multi-day
 * schedule looks like — so `key` is the identity and `animeId` is the grouping.
 */
export interface OrderingInstanceBase {
  readonly key: string;
  readonly animeId: string;
}

/**
 * Working state for any drag-and-drop ordering board: per-container ordered
 * instance keys (the shape `move` from `@dnd-kit/helpers` reorders) plus the
 * instance lookup by key.
 *
 * Generic over the instance so a feature can carry its own card fields without
 * re-implementing the transitions. `duplicateAllowedDestinations` names the
 * wildcard containers — a rail, a staging area — where the same anime may appear
 * more than once; every other container holds at most one card per anime.
 */
export interface OrderingState<TInstance extends OrderingInstanceBase> {
  readonly order: Record<string, readonly string[]>;
  readonly instances: Record<string, TInstance>;
  readonly duplicateAllowedDestinations?: readonly string[];
}

/** A move expressed in domain terms, for callers that cannot perform a real drag. */
export interface OrderingMoveCommand {
  readonly animeId: string;
  readonly destinationId: string;
  readonly order: number;
}

/** The drag event shape the shared hover guard reads. */
export type OrderingDragOverEvent = DragOverEvent;
