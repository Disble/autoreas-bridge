import type { DragOverEvent } from '@dnd-kit/react';
import type { OrderingBoard, OrderingCard } from '../../../../infrastructure/season-source';
import { CONTAINERS, RAIL_CONTAINER_ID, WEEKDAYS } from './ordering-board.constants';
import type { ContainerId, DraftPlacement, OrderingInstance, Weekday, WorkingState } from './ordering-board.types';

/** emptyOrder builds a container→[] map with every container present (rail + seven days). */
function emptyOrder(): Record<string, string[]> {
  const order: Record<string, string[]> = {};
  for (const container of CONTAINERS) {
    order[container] = [];
  }
  return order;
}

/** nextKey mints a stable, unique sortable key for a new instance of an anime. */
function nextKey(instances: Record<string, OrderingInstance>, animeId: string): string {
  let seq = 0;
  while (instances[`${animeId}#${seq}`] !== undefined) {
    seq += 1;
  }
  return `${animeId}#${seq}`;
}

/**
 * initialWorkingState builds the editable working state from a loaded board: each rail
 * card and each weekday clone becomes an instance with a stable key, grouped into its
 * container. Weekday columns are ordered by the loaded orden.
 */
export function initialWorkingState(board: OrderingBoard): WorkingState {
  const order = emptyOrder();
  const instances: Record<string, OrderingInstance> = {};
  const add = (container: string, card: OrderingCard) => {
    const key = nextKey(instances, card.animeId);
    instances[key] = {
      key,
      animeId: card.animeId,
      name: card.name,
      isPendingDuplicate: false,
      section: card.section,
      orden: card.orden,
      isNewcomer: card.isNewcomer,
    };
    order[container].push(key);
  };

  for (const card of board.rail) {
    add(RAIL_CONTAINER_ID, card);
  }
  const byDay: Record<string, OrderingCard[]> = {};
  for (const day of WEEKDAYS) {
    byDay[day] = [];
  }
  for (const card of board.grid) {
    if (byDay[card.dia] !== undefined) {
      byDay[card.dia].push(card);
    }
  }
  for (const day of WEEKDAYS) {
    for (const card of byDay[day].toSorted((a, b) => a.orden - b.orden)) {
      add(day, card);
    }
  }
  return { order, instances };
}

/** railInstances / columnInstances resolve a container's ordered keys to their instances. */
export function instancesIn(state: WorkingState, container: string): OrderingInstance[] {
  return (state.order[container] ?? []).map((key) => state.instances[key]);
}

/** cardCounts totals how many card instances each anime has (rail + all days). */
export function cardCounts(state: WorkingState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const instance of Object.values(state.instances)) {
    counts[instance.animeId] = (counts[instance.animeId] ?? 0) + 1;
  }
  return counts;
}

/** scheduledCount is the number of distinct animes placed on any weekday (clones counted once). */
export function scheduledCount(state: WorkingState): number {
  const ids = new Set<string>();
  for (const day of WEEKDAYS) {
    for (const key of state.order[day] ?? []) {
      ids.add(state.instances[key].animeId);
    }
  }
  return ids.size;
}

/** hasDuplicatePerContainer reports whether any weekday container holds two clones of the same anime. */
function hasDuplicatePerContainer(order: Record<string, readonly string[]>, instances: Record<string, OrderingInstance>): boolean {
  for (const container of WEEKDAYS) {
    const seen = new Set<string>();
    for (const key of order[container] ?? []) {
      const animeId = instances[key].animeId;
      if (seen.has(animeId)) {
        return true;
      }
      seen.add(animeId);
    }
  }
  return false;
}

/** isContainerId narrows an arbitrary string to one of the known rail/weekday container ids. */
function isContainerId(value: string): value is ContainerId {
  return (CONTAINERS as readonly string[]).includes(value);
}

/** isWeekday narrows an arbitrary string to one of the real weekday columns. */
function isWeekday(value: string): value is Weekday {
  return (WEEKDAYS as readonly string[]).includes(value);
}

/** targetContainerFor resolves a drag target id to its weekday/rail container id. */
function targetContainerFor(state: WorkingState, targetId: string): ContainerId | undefined {
  if (isContainerId(targetId)) {
    return targetId;
  }

  for (const [containerId, keys] of Object.entries(state.order)) {
    if (keys.includes(targetId)) {
      return containerId as ContainerId;
    }
  }

  return undefined;
}

/** hasDuplicateWeekdayPlacements validates the strong invariant that weekdays never carry the same anime twice. */
export function hasDuplicateWeekdayPlacements(state: WorkingState): boolean {
  return hasDuplicatePerContainer(state.order, state.instances);
}

/**
 * shouldCancelForbiddenWeekdayHover blocks optimistic drag projection before dnd-kit moves
 * a card into a weekday that already contains the same anime. This keeps forbidden
 * weekday duplicates from ever entering the projected drag state, which avoids the crash
 * path where app-level validation would roll the move back only after `move(...)` ran.
 */
export function shouldCancelForbiddenWeekdayHover(state: WorkingState, event: DragOverEvent): boolean {
  const sourceId = event.operation.source?.id;
  const targetId = event.operation.target?.id;

  if (typeof sourceId !== 'string' || typeof targetId !== 'string') {
    return false;
  }
  const targetContainerId = targetContainerFor(state, targetId);

  if (targetContainerId === undefined || !isWeekday(targetContainerId)) {
    return false;
  }

  const instance = state.instances[sourceId];

  return (state.order[targetContainerId] ?? []).some((key) => state.instances[key]?.animeId === instance.animeId && key !== sourceId);
}

/**
 * applyOrder accepts a reordered container map (produced by `move`) unless it would put
 * two clones of the same anime on one weekday — the approved rail is exempt from that
 * rule, so forbidden drops are weekday-only no-ops.
 */
export function applyOrder(state: WorkingState, order: Record<string, readonly string[]>): WorkingState {
  if (hasDuplicatePerContainer(order, state.instances)) {
    return state;
  }
  return { order, instances: state.instances };
}

/**
 * duplicate stages a logical copy of an anime into the rail (same anime — never a
 * second DB row) so it can be dragged onto another weekday. The approved rail can keep
 * several pending copies because it is not a weekday container.
 */
export function duplicate(state: WorkingState, animeId: string): WorkingState {
  const meta = Object.values(state.instances).find((instance) => instance.animeId === animeId);
  if (meta === undefined) {
    return state;
  }
  const key = nextKey(state.instances, animeId);
    return {
      order: { ...state.order, [RAIL_CONTAINER_ID]: [...state.order[RAIL_CONTAINER_ID], key] },
      instances: { ...state.instances, [key]: { ...meta, key, isPendingDuplicate: true, section: '', orden: 0 } },
    };
}

/**
 * removeCard deletes one card instance. Guarded by the minimum-one rule: an anime's
 * last remaining instance can never be deleted — it must always sit somewhere.
 */
export function removeCard(state: WorkingState, key: string): WorkingState {
  const instance = state.instances[key];
  const total = Object.values(state.instances).filter((i) => i.animeId === instance.animeId).length;
  if (total <= 1) {
    return state;
  }
  const order: Record<string, string[]> = {};
  for (const container of Object.keys(state.order)) {
    order[container] = state.order[container].filter((k) => k !== key);
  }
  const instances = { ...state.instances };
  delete instances[key];
  return { order, instances };
}

/**
 * buildDraft builds the ordering draft (`{animeId: [{dia, orden}]}`): each weekday clone
 * contributes one placement (an anime on several days emits several), renumbered by
 * column position; a genuinely unplaced rail card keeps its Estrenos section placement.
 * A pending duplicate adds nothing until dragged onto a day.
 */
export function buildDraft(state: WorkingState): Record<string, DraftPlacement[]> {
  const draft: Record<string, DraftPlacement[]> = {};
  for (const day of WEEKDAYS) {
    (state.order[day] ?? []).forEach((key, index) => {
      const instance = state.instances[key];
      const placements = draft[instance.animeId] ?? [];
      placements.push({ dia: day, orden: index + 1 });
      draft[instance.animeId] = placements;
    });
  }
  for (const key of state.order[RAIL_CONTAINER_ID] ?? []) {
    const instance = state.instances[key];
    if (!instance.isPendingDuplicate && draft[instance.animeId] === undefined && instance.section !== '') {
      draft[instance.animeId] = [{ dia: instance.section, orden: instance.orden }];
    }
  }
  return draft;
}

/** serializeDraft is buildDraft rendered as the JSON string the backend persists. */
export function serializeDraft(state: WorkingState): string {
  return JSON.stringify(buildDraft(state));
}

/**
 * countChanges reports how many animes' placement SET differs from the loaded board.
 * Both sides are normalized through buildDraft (renumbered per day) so a stable layout
 * diffs to zero regardless of stored orden gaps — multi-day aware.
 */
export function countChanges(board: OrderingBoard, state: WorkingState): number {
  const original = buildDraft(initialWorkingState(board));
  const working = buildDraft(state);
  const key = (placements: readonly DraftPlacement[]): string =>
    placements
      .map((p) => `${p.dia}#${p.orden}`)
      .toSorted((left, right) => left.localeCompare(right))
      .join('|');

  const ids = new Set([...Object.keys(original), ...Object.keys(working)]);
  let changes = 0;
  for (const id of ids) {
    const before = original[id] === undefined ? '' : key(original[id]);
    const after = working[id] === undefined ? '' : key(working[id]);
    if (before !== after) {
      changes += 1;
    }
  }
  return changes;
}
