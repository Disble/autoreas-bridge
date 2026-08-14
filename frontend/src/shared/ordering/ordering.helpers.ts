import type { OrderingDragOverEvent, OrderingInstanceBase, OrderingMoveCommand, OrderingState } from './ordering.types';

/**
 * Allocates the next free `animeId#n` key so a new card never collides with an
 * existing placement of the same anime.
 * @param instances The current instance lookup.
 * @param animeId The anime the new card is a placement of.
 * @returns A key that is free in `instances`.
 */
export function nextInstanceKey<TInstance extends OrderingInstanceBase>(
  instances: Record<string, TInstance>,
  animeId: string,
): string {
  let index = 0;
  while (instances[`${animeId}#${index}`] !== undefined) {
    index += 1;
  }
  return `${animeId}#${index}`;
}

/**
 * Resolves which container an id belongs to. dnd-kit reports a hover target that
 * is either a container itself or one of the cards inside it, so both must map
 * back to the same container before any rule is evaluated.
 * @param state The current board state.
 * @param targetId A container id or a card key.
 * @returns The container id, or undefined when the id is neither.
 */
export function resolveContainerOf<TInstance extends OrderingInstanceBase>(
  state: OrderingState<TInstance>,
  targetId: string,
): string | undefined {
  if (state.order[targetId] !== undefined) {
    return targetId;
  }
  for (const [containerId, keys] of Object.entries(state.order)) {
    if (keys.includes(targetId)) {
      return containerId;
    }
  }
  return undefined;
}

/**
 * Finds the key of the first card placed for an anime.
 * @param state The current board state.
 * @param animeId The anime to look for.
 * @returns The card key, or undefined when the anime has no placement.
 */
export function findKeyForAnime<TInstance extends OrderingInstanceBase>(
  state: OrderingState<TInstance>,
  animeId: string,
): string | undefined {
  for (const keys of Object.values(state.order)) {
    const key = keys.find((candidate) => state.instances[candidate]?.animeId === animeId);
    if (key !== undefined) {
      return key;
    }
  }
  return undefined;
}

/**
 * Resolves the ordered instances of one container without leaking the internal
 * key map into JSX.
 * @param state The current board state.
 * @param containerId The container to read.
 * @returns The instances in render order; empty for an unknown container.
 */
export function getInstancesIn<TInstance extends OrderingInstanceBase>(
  state: OrderingState<TInstance>,
  containerId: string,
): TInstance[] {
  return (state.order[containerId] ?? []).map((key) => state.instances[key]);
}

/**
 * Decides whether a drag hover must be cancelled because it would project the
 * same anime twice into an exclusive container.
 * @param state The current board state.
 * @param event The dnd-kit drag-over event.
 * @returns True when the hover must be blocked.
 */
export function shouldBlockDuplicateHover<TInstance extends OrderingInstanceBase>(
  state: OrderingState<TInstance>,
  event: OrderingDragOverEvent,
): boolean {
  const sourceId = event.operation.source?.id;
  const targetId = event.operation.target?.id;

  if (typeof sourceId !== 'string' || typeof targetId !== 'string') {
    return false;
  }

  const targetContainerId = resolveContainerOf(state, targetId);
  if (targetContainerId === undefined || state.duplicateAllowedDestinations?.includes(targetContainerId) === true) {
    return false;
  }

  if (!Object.hasOwn(state.instances, sourceId)) {
    return true;
  }
  const sourceInstance = state.instances[sourceId];

  return (state.order[targetContainerId] ?? []).some(
    (key) => state.instances[key]?.animeId === sourceInstance.animeId && key !== sourceId,
  );
}

/**
 * Applies a projected container order, rejecting the whole projection when it
 * would place the same anime twice in an exclusive container. Rejecting the
 * projection rather than repairing it keeps the board at the last legal state,
 * so a forbidden drag simply does not land.
 * @param state The current board state.
 * @param order The projected per-container key order.
 * @returns The next state, or the same reference when the projection is refused.
 */
export function applyOrdering<TInstance extends OrderingInstanceBase>(
  state: OrderingState<TInstance>,
  order: Record<string, readonly string[]>,
): OrderingState<TInstance> {
  const duplicateAllowed = new Set(state.duplicateAllowedDestinations);
  for (const [containerId, keys] of Object.entries(order)) {
    if (duplicateAllowed.has(containerId)) continue;
    const seen = new Set<string>();
    for (const key of keys) {
      const animeId = state.instances[key].animeId;
      if (seen.has(animeId)) {
        return state;
      }
      seen.add(animeId);
    }
  }

  return { order, instances: state.instances, duplicateAllowedDestinations: state.duplicateAllowedDestinations };
}

/**
 * Stages one extra card for an anime so a multi-container placement can be
 * expressed by dragging, without mutating canonical data until apply. The clone
 * lands in the first wildcard container, where it cannot collide.
 * @param state The current board state.
 * @param animeId The anime to clone.
 * @returns The next state, or the same reference when the anime has no card.
 */
export function duplicateOrderingCard<TInstance extends OrderingInstanceBase>(
  state: OrderingState<TInstance>,
  animeId: string,
): OrderingState<TInstance> {
  const seed = Object.values(state.instances).find((instance) => instance.animeId === animeId);
  if (seed === undefined) {
    return state;
  }

  const key = nextInstanceKey(state.instances, animeId);
  const firstDestinationId = state.duplicateAllowedDestinations?.[0] ?? Object.keys(state.order)[0];

  return {
    order: {
      ...state.order,
      [firstDestinationId]: [...(state.order[firstDestinationId] ?? []), key],
    },
    instances: {
      ...state.instances,
      [key]: { ...seed, key },
    },
    duplicateAllowedDestinations: state.duplicateAllowedDestinations,
  };
}

/**
 * Removes one card while preserving at least one placement per anime, so an
 * anime can never be dropped off the board by deleting its cards.
 * @param state The current board state.
 * @param key The card to remove.
 * @returns The next state, or the same reference when this was the last card.
 */
export function removeOrderingCard<TInstance extends OrderingInstanceBase>(
  state: OrderingState<TInstance>,
  key: string,
): OrderingState<TInstance> {
  const target = state.instances[key];
  const count = Object.values(state.instances).filter((instance) => instance.animeId === target.animeId).length;
  if (count <= 1) {
    return state;
  }

  const nextOrder: Record<string, readonly string[]> = {};
  for (const [containerId, keys] of Object.entries(state.order)) {
    nextOrder[containerId] = keys.filter((candidate) => candidate !== key);
  }
  const nextInstances = { ...state.instances };
  delete nextInstances[key];
  return { order: nextOrder, instances: nextInstances, duplicateAllowedDestinations: state.duplicateAllowedDestinations };
}

/**
 * Moves an anime into a requested container and slot through the same state
 * shape drag projection updates, giving callers that cannot drag — jsdom tests,
 * keyboard affordances — a legitimate seam into the real transitions.
 * @param state The current board state.
 * @param command The requested destination and 1-based slot.
 * @returns The next state, or the same reference when the move cannot apply.
 */
export function moveOrderingCard<TInstance extends OrderingInstanceBase>(
  state: OrderingState<TInstance>,
  command: Readonly<OrderingMoveCommand>,
): OrderingState<TInstance> {
  if (state.order[command.destinationId] === undefined) {
    return state;
  }

  const key = findKeyForAnime(state, command.animeId);
  if (key === undefined) {
    return state;
  }

  const nextOrder: Record<string, readonly string[]> = {};
  for (const [containerId, keys] of Object.entries(state.order)) {
    nextOrder[containerId] = keys.filter((candidate) => candidate !== key);
  }

  const destinationKeys = [...(nextOrder[command.destinationId] ?? [])];
  const index = Math.max(0, Math.min(command.order - 1, destinationKeys.length));
  destinationKeys.splice(index, 0, key);
  nextOrder[command.destinationId] = destinationKeys;

  return applyOrdering(state, nextOrder);
}
