import type { DragOverEvent } from '@dnd-kit/react';
import type { ApplyAnimeScheduleDraftEntry, AnimeEditorScheduleBoard } from '../../../../shared/contracts/anime.types';
import { ANIME_SCHEDULE_ORDERING_DUPLICATE_ERROR } from './anime-schedule-ordering.constants';
import type { AnimeScheduleDraftPlacement, AnimeScheduleOrderingInstance, AnimeScheduleOrderingState, AnimeScheduleOrderingTestMoveCommand } from './anime-schedule-ordering.types';

function createEmptyOrder(board: AnimeEditorScheduleBoard) {
  const order: Record<string, string[]> = {};
  for (const destination of board.destinations) {
    order[destination.id] = [];
  }
  return order;
}

function nextKey(instances: Record<string, AnimeScheduleOrderingInstance>, animeId: string) {
  let index = 0;
  while (instances[`${animeId}#${index}`] !== undefined) {
    index += 1;
  }
  return `${animeId}#${index}`;
}

function targetContainerFor(state: AnimeScheduleOrderingState, targetId: string) {
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

function keyForAnime(state: AnimeScheduleOrderingState, animeId: string) {
  for (const keys of Object.values(state.order)) {
    const key = keys.find((candidate) => state.instances[candidate]?.animeId === animeId);
    if (key !== undefined) {
      return key;
    }
  }
  return undefined;
}

function createDestinationRank(board: AnimeEditorScheduleBoard) {
  return new Map(board.destinations.map((destination, index) => [destination.id, index]));
}

function compareDestinationIds(destinationRank: ReadonlyMap<string, number>, leftDay: string, rightDay: string) {
  const leftRank = destinationRank.get(leftDay) ?? Number.MAX_SAFE_INTEGER;
  const rightRank = destinationRank.get(rightDay) ?? Number.MAX_SAFE_INTEGER;

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return leftDay.localeCompare(rightDay);
}

function comparePlacements(
  destinationRank: ReadonlyMap<string, number>,
  left: Readonly<AnimeScheduleDraftPlacement>,
  right: Readonly<AnimeScheduleDraftPlacement>,
) {
  const destinationComparison = compareDestinationIds(destinationRank, left.day, right.day);
  if (destinationComparison !== 0) {
    return destinationComparison;
  }

  return left.order - right.order;
}

/**
 * Builds the editable schedule state from the authoritative schedule board so both
 * the editor modal and the Season adapter can share one ordering model.
 */
export function createAnimeScheduleOrderingState(board: AnimeEditorScheduleBoard): AnimeScheduleOrderingState {
  const order = createEmptyOrder(board);
  const instances: Record<string, AnimeScheduleOrderingInstance> = {};
  const defaultDestinationId = board.destinations.find((destination) => destination.kind === 'special')?.id ?? board.destinations[0]?.id ?? 'Sin ver';

  for (const entry of board.entries) {
    const placements = entry.placements.length > 0
      ? entry.placements.toSorted((left, right) => left.order - right.order)
      : [{ day: defaultDestinationId, order: 1 }];

    for (const placement of placements) {
      const key = nextKey(instances, entry.animeId);
      instances[key] = {
        key,
        animeId: entry.animeId,
        name: entry.name,
        baseModifiedAt: entry.modifiedAt,
        originHighlighted: entry.originHighlighted,
        initialOrder: placement.order,
      };
      order[placement.day] = [...(order[placement.day] ?? []), key];
    }
  }

  for (const keys of Object.values(order)) {
    keys.sort((left, right) => (instances[left].initialOrder ?? 0) - (instances[right].initialOrder ?? 0));
  }

  return { order, instances };
}

/**
 * Resolves the ordered instances for one destination without leaking the internal
 * key map into JSX.
 */
export function getInstancesInDestination(state: AnimeScheduleOrderingState, destinationId: string) {
  return (state.order[destinationId] ?? []).map((key) => state.instances[key]);
}

/**
 * Prevents a drag hover from projecting a duplicate anime into the same destination.
 */
export function shouldBlockDuplicateHover(state: AnimeScheduleOrderingState, event: DragOverEvent) {
  const sourceId = event.operation.source?.id;
  const targetId = event.operation.target?.id;

  if (typeof sourceId !== 'string' || typeof targetId !== 'string') {
    return false;
  }

  const targetContainerId = targetContainerFor(state, targetId);
  if (targetContainerId === undefined || state.duplicateAllowedDestinations?.includes(targetContainerId) === true) {
    return false;
  }

  if (!Object.hasOwn(state.instances, sourceId)) {
    return true;
  }
  const sourceInstance = state.instances[sourceId];

  return (state.order[targetContainerId] ?? []).some((key) => state.instances[key]?.animeId === sourceInstance.animeId && key !== sourceId);
}

/**
 * Applies a projected destination order unless it would violate the one-anime-per-
 * destination rule that protects the shared schedule draft.
 */
export function applyAnimeScheduleOrder(state: AnimeScheduleOrderingState, order: Record<string, readonly string[]>) {
  const duplicateAllowed = new Set(state.duplicateAllowedDestinations);
  for (const [destinationId, keys] of Object.entries(order)) {
    if (duplicateAllowed.has(destinationId)) continue;
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
 * Stages one extra card for the given anime so multi-day schedules can be expressed
 * through drag and drop without mutating canonical data until apply.
 */
export function duplicateAnimeScheduleCard(state: AnimeScheduleOrderingState, animeId: string) {
  const seed = Object.values(state.instances).find((instance) => instance.animeId === animeId);
  if (seed === undefined) {
    return state;
  }

  const key = nextKey(state.instances, animeId);
  const firstDestinationId = Object.keys(state.order)[0];

  return {
    order: {
      ...state.order,
      [firstDestinationId]: [...(state.order[firstDestinationId] ?? []), key],
    },
    instances: {
      ...state.instances,
      [key]: {
        ...seed,
        key,
      },
    },
    duplicateAllowedDestinations: state.duplicateAllowedDestinations,
  };
}

/**
 * Removes one draft card while preserving at least one placement per anime.
 */
export function removeAnimeScheduleCard(state: AnimeScheduleOrderingState, key: string) {
  const target = state.instances[key];
  const count = Object.values(state.instances).filter((instance) => instance.animeId === target.animeId).length;
  if (count <= 1) {
    return state;
  }

  const nextOrder: Record<string, readonly string[]> = {};
  for (const [destinationId, keys] of Object.entries(state.order)) {
    nextOrder[destinationId] = keys.filter((candidate) => candidate !== key);
  }
  const nextInstances = { ...state.instances };
  delete nextInstances[key];
  return { order: nextOrder, instances: nextInstances, duplicateAllowedDestinations: state.duplicateAllowedDestinations };
}

/**
 * Moves one anime into a requested destination/order slot through the same draft
 * state shape that drag projection updates, giving jsdom tests a legitimate seam.
 */
export function moveAnimeScheduleCard(state: AnimeScheduleOrderingState, command: Readonly<AnimeScheduleOrderingTestMoveCommand>) {
  if (state.order[command.destinationId] === undefined) {
    return state;
  }

  const key = keyForAnime(state, command.animeId);
  if (key === undefined) {
    return state;
  }

  const nextOrder: Record<string, readonly string[]> = {};
  for (const [destinationId, keys] of Object.entries(state.order)) {
    nextOrder[destinationId] = keys.filter((candidate) => candidate !== key);
  }

  const destinationKeys = [...(nextOrder[command.destinationId] ?? [])];
  const index = Math.max(0, Math.min(command.order - 1, destinationKeys.length));
  destinationKeys.splice(index, 0, key);
  nextOrder[command.destinationId] = destinationKeys;

  return applyAnimeScheduleOrder(state, nextOrder);
}

/**
 * Builds the per-anime placement map that the editor apply command serializes.
 */
export function buildAnimeScheduleDraftPlacements(state: AnimeScheduleOrderingState) {
  const draft: Record<string, AnimeScheduleDraftPlacement[]> = {};
  const duplicateAllowed = new Set(state.duplicateAllowedDestinations);

  for (const [destinationId, keys] of Object.entries(state.order)) {
    if (duplicateAllowed.has(destinationId)) continue;
    keys.forEach((key, index) => {
      const instance = state.instances[key];
      draft[instance.animeId] = [...(draft[instance.animeId] ?? []), { day: destinationId, order: index + 1 }];
    });
  }

  return draft;
}

function normalizePlacements(destinationRank: ReadonlyMap<string, number>, placements: readonly AnimeScheduleDraftPlacement[]) {
  // Placement order is global to its destination. Reindexing this one anime's
  // placements would erase an in-column move such as Visto#4 -> Visto#1.
  return sortPlacements(destinationRank, placements);
}

function sortPlacements(destinationRank: ReadonlyMap<string, number>, placements: readonly AnimeScheduleDraftPlacement[]) {
  return placements.toSorted((left, right) => comparePlacements(destinationRank, left, right));
}

function compareApplyEntries(
  destinationRank: ReadonlyMap<string, number>,
  left: Readonly<ApplyAnimeScheduleDraftEntry>,
  right: Readonly<ApplyAnimeScheduleDraftEntry>,
) {
  const leftPlacement = left.placements.at(0);
  const rightPlacement = right.placements.at(0);

  if (leftPlacement !== undefined && rightPlacement !== undefined) {
    const placementComparison = comparePlacements(destinationRank, leftPlacement, rightPlacement);
    if (placementComparison !== 0) {
      return placementComparison;
    }
  }

  if (leftPlacement !== undefined || rightPlacement !== undefined) {
    return leftPlacement === undefined ? 1 : -1;
  }

  return left.animeId.localeCompare(right.animeId);
}

/**
 * Counts how many anime differ between the authoritative board snapshot and the current
 * draft so the footer can show meaningful dirty feedback.
 */
export function countAnimeScheduleChanges(board: AnimeEditorScheduleBoard, state: AnimeScheduleOrderingState) {
  const destinationRank = createDestinationRank(board);
  const original = createAnimeScheduleOrderingState(board);
  const before = buildAnimeScheduleDraftPlacements(original);
  const after = buildAnimeScheduleDraftPlacements(state);
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  let changes = 0;

  for (const animeId of ids) {
    const normalizedBefore = JSON.stringify(normalizePlacements(destinationRank, before[animeId] ?? []));
    const normalizedAfter = JSON.stringify(normalizePlacements(destinationRank, after[animeId] ?? []));
    if (normalizedBefore !== normalizedAfter) {
      changes += 1;
    }
  }

  return changes;
}

/**
 * Validates the draft before apply and returns a user-facing message when a destination
 * duplicates one anime or the ordering cannot be normalized cleanly.
 */
export function validateAnimeScheduleDraft(state: AnimeScheduleOrderingState) {
  const duplicateAllowed = new Set(state.duplicateAllowedDestinations);
  for (const [destinationId, keys] of Object.entries(state.order)) {
    if (duplicateAllowed.has(destinationId)) continue;
    const seen = new Set<string>();
    for (const key of keys) {
      const animeId = state.instances[key].animeId;
      if (seen.has(animeId)) {
        return `${ANIME_SCHEDULE_ORDERING_DUPLICATE_ERROR} (${destinationId})`;
      }
      seen.add(animeId);
    }
  }
  return undefined;
}

/**
 * Converts the dirty draft into the changed-record-only Wails payload the backend expects.
 */
export function createAnimeScheduleApplyEntries(board: AnimeEditorScheduleBoard, state: AnimeScheduleOrderingState): readonly ApplyAnimeScheduleDraftEntry[] {
  const destinationRank = createDestinationRank(board);
  const original = buildAnimeScheduleDraftPlacements(createAnimeScheduleOrderingState(board));
  const current = buildAnimeScheduleDraftPlacements(state);
  const changed: ApplyAnimeScheduleDraftEntry[] = [];

  for (const entry of board.entries) {
    const before = JSON.stringify(normalizePlacements(destinationRank, original[entry.animeId] ?? []));
    const currentPlacements = current[entry.animeId] ?? [];
    const after = JSON.stringify(normalizePlacements(destinationRank, currentPlacements));
    if (before === after) {
      continue;
    }
    changed.push({
      animeId: entry.animeId,
      baseModifiedAt: entry.modifiedAt,
      placements: sortPlacements(destinationRank, currentPlacements),
    });
  }

  return changed.toSorted((left, right) => compareApplyEntries(destinationRank, left, right));
}
