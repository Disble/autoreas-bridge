import type { DragOverEvent } from '@dnd-kit/react';
import type { OrderingBoard, OrderingCard, SeasonAnimeRow } from '../../../../infrastructure/season-source';
import type { AnimeEditorScheduleBoard } from '../../../../shared/contracts/anime.types';
import {
  applyAnimeScheduleOrder,
  buildAnimeScheduleDraftPlacements,
  createAnimeScheduleOrderingState,
  duplicateAnimeScheduleCard,
  getInstancesInDestination,
  removeAnimeScheduleCard,
  shouldBlockDuplicateHover,
  validateAnimeScheduleDraft,
} from '../../../anime-schedule-ordering/ui/AnimeScheduleOrdering/anime-schedule-ordering.helpers';
import { RAIL_CONTAINER_ID, WEEKDAYS } from './ordering-board.constants';
import type { DraftPlacement, OrderingCardMeta, OrderingInstance, WorkingState } from './ordering-board.types';

function cardsByAnime(board: OrderingBoard) {
  const cards = [...board.rail, ...board.grid];
  return [...new Set(cards.map((card) => card.animeId))].map((animeId) => cards.filter((card) => card.animeId === animeId));
}

function toSharedBoard(board: OrderingBoard): AnimeEditorScheduleBoard {
  return {
    originAnimeId: '', boardModifiedAt: 0,
    destinations: [
      { id: RAIL_CONTAINER_ID, label: 'Approved to place', kind: 'special' },
      ...WEEKDAYS.map((day) => ({ id: day, label: day, kind: 'weekday' as const })),
    ],
    entries: cardsByAnime(board).map((cards) => ({
      animeId: cards[0].animeId,
      name: cards[0].name,
      active: true,
      modifiedAt: 0,
      placements: cards.map((card) => ({ day: card.dia || RAIL_CONTAINER_ID, order: card.orden })),
      status: 0,
      progress: 0,
      originHighlighted: false,
    })),
  };
}

function sourceCardFor(board: OrderingBoard, animeId: string, containerId: string): OrderingCard {
  const cards = [...board.rail, ...board.grid];
  return cards.find((card) => card.animeId === animeId && (card.dia || RAIL_CONTAINER_ID) === containerId)
    ?? cards.find((card) => card.animeId === animeId)!;
}

function placementKey(placements: readonly DraftPlacement[]) {
  return placements.map((placement) => `${placement.dia}#${placement.orden}`).toSorted((left, right) => left.localeCompare(right)).join('|');
}

/** Builds the Season adapter state through the reusable schedule-specific core. */
export function initialWorkingState(board: OrderingBoard): WorkingState {
  const shared = createAnimeScheduleOrderingState(toSharedBoard(board));
  const instances: Record<string, OrderingInstance> = {};
  for (const [key, instance] of Object.entries(shared.instances)) {
    const containerId = Object.entries(shared.order).find(([, keys]) => keys.includes(key))?.[0] ?? RAIL_CONTAINER_ID;
    const card = sourceCardFor(board, instance.animeId, containerId);
    instances[key] = { ...instance, isPendingDuplicate: false, section: card.section, orden: card.orden, isNewcomer: card.isNewcomer };
  }
  return { order: shared.order, instances, duplicateAllowedDestinations: [RAIL_CONTAINER_ID] };
}

/**
 * Joins the season selection rows into a per-anime lookup of grade and
 * desktop-action affordances, keyed by `animeId`. Ordering cards carry only an
 * `animeId`, so the board reads grade/page/folder from this map rather than the
 * ordering read model. Rows without an `animeId` (uncreated candidates) are
 * skipped.
 */
export function buildOrderingCardMeta(rows: readonly SeasonAnimeRow[]): Record<string, OrderingCardMeta> {
  const meta: Record<string, OrderingCardMeta> = {};
  for (const row of rows) {
    if (row.animeId === '') {
      continue;
    }
    const pageUrl = row.pageUrl ?? '';
    const folderPath = row.folderPath ?? '';
    meta[row.animeId] = {
      grade: row.grade,
      pageUrl,
      folderPath,
      hasPage: pageUrl !== '',
      hasFolder: folderPath !== '',
    };
  }
  return meta;
}

/** Resolves one Season destination through the shared ordered collection. */
export function instancesIn(state: WorkingState, container: string): OrderingInstance[] {
  return getInstancesInDestination(state, container) as OrderingInstance[];
}

/** Counts card instances per anime for minimum-one controls. */
export function cardCounts(state: WorkingState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const instance of Object.values(state.instances)) counts[instance.animeId] = (counts[instance.animeId] ?? 0) + 1;
  return counts;
}

/** Counts distinct anime assigned to weekdays. */
export function scheduledCount(state: WorkingState): number {
  const ids = new Set<string>();
  for (const day of WEEKDAYS) for (const instance of instancesIn(state, day)) ids.add(instance.animeId);
  return ids.size;
}

/** Validates the Season weekday invariant while allowing duplicate staging cards. */
export function hasDuplicateWeekdayPlacements(state: WorkingState): boolean {
  return validateAnimeScheduleDraft(state) !== undefined;
}

/** Blocks same-anime weekday hover through the reusable schedule core. */
export function shouldCancelForbiddenWeekdayHover(state: WorkingState, event: DragOverEvent): boolean {
  return shouldBlockDuplicateHover(state, event);
}

/** Applies projected DnD order through the reusable schedule core. */
export function applyOrder(state: WorkingState, order: Record<string, readonly string[]>): WorkingState {
  return applyAnimeScheduleOrder(state, order) as WorkingState;
}

/** Stages a Season clone in the approved rail through the reusable schedule core. */
export function duplicate(state: WorkingState, animeId: string): WorkingState {
  const next = duplicateAnimeScheduleCard(state, animeId);
  if (next === state) return state;
  const key = Object.keys(next.instances).find((candidate) => state.instances[candidate] === undefined)!;
  return {
    order: next.order,
    duplicateAllowedDestinations: [RAIL_CONTAINER_ID],
    instances: { ...next.instances, [key]: { ...next.instances[key], isPendingDuplicate: true, section: '', orden: 0 } } as Record<string, OrderingInstance>,
  };
}

/** Removes a Season clone while retaining one card through the reusable core. */
export function removeCard(state: WorkingState, key: string): WorkingState {
  return removeAnimeScheduleCard(state, key) as WorkingState;
}

/** Serializes shared ordered collections into the existing Season persistence DTO. */
export function buildDraft(state: WorkingState): Record<string, DraftPlacement[]> {
  const placements = buildAnimeScheduleDraftPlacements(state);
  const draft: Record<string, DraftPlacement[]> = {};
  for (const [animeId, values] of Object.entries(placements)) {
    const weekdays = values.filter((placement) => placement.day !== RAIL_CONTAINER_ID);
    if (weekdays.length > 0) draft[animeId] = weekdays.map((placement) => ({ dia: placement.day, orden: placement.order }));
  }
  for (const instance of instancesIn(state, RAIL_CONTAINER_ID)) {
    if (!instance.isPendingDuplicate && draft[instance.animeId] === undefined && instance.section !== '') {
      draft[instance.animeId] = [{ dia: instance.section, orden: instance.orden }];
    }
  }
  return draft;
}

/** Renders the Season draft as the JSON persisted by its adapter. */
export function serializeDraft(state: WorkingState): string {
  return JSON.stringify(buildDraft(state));
}

/** Counts anime whose normalized placements differ from loaded Season authority. */
export function countChanges(board: OrderingBoard, state: WorkingState): number {
  const before = buildDraft(initialWorkingState(board));
  const after = buildDraft(state);
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...ids].filter((animeId) => placementKey(before[animeId] ?? []) !== placementKey(after[animeId] ?? [])).length;
}
