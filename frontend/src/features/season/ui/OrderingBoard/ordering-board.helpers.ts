import type { OrderingBoard, OrderingCard } from '../../../../infrastructure/season-source';
import { WEEKDAYS } from './ordering-board.constants';
import type { DraftPlacement, WorkingState } from './ordering-board.types';

/** RAIL is the "location" sentinel for a card awaiting placement (not on any weekday). */
export const RAIL = '';

/**
 * groupGridByDay groups the grid cards into the seven weekday columns, each sorted
 * by orden ascending. Every weekday key is always present (empty columns render).
 * An anime that airs on several days appears as a clone in each of its columns.
 */
export function groupGridByDay(grid: readonly OrderingCard[]): Record<string, OrderingCard[]> {
  const byDay: Record<string, OrderingCard[]> = {};
  for (const day of WEEKDAYS) {
    byDay[day] = [];
  }
  for (const card of grid) {
    const column = byDay[card.dia];
    if (column !== undefined) {
      column.push(card);
    }
  }
  for (const day of WEEKDAYS) {
    byDay[day] = byDay[day].toSorted((a, b) => a.orden - b.orden);
  }
  return byDay;
}

/** renumber reassigns orden 1..N to cards by their current array position. */
export function renumber(cards: readonly OrderingCard[]): OrderingCard[] {
  return cards.map((card, index) => ({ ...card, orden: index + 1 }));
}

/**
 * buildDraft builds the ordering draft (`{animeId: [{dia, orden}]}`): each weekday
 * clone contributes one placement (an anime on several days emits several),
 * renumbered by column position; a genuinely unplaced rail card keeps its Estrenos
 * section placement. A pending duplicate (empty section, or an anime that already
 * has weekday placements) adds nothing — it only matters once dragged onto a day.
 */
export function buildDraft(
  columns: Record<string, readonly OrderingCard[]>,
  rail: readonly OrderingCard[],
): Record<string, DraftPlacement[]> {
  const draft: Record<string, DraftPlacement[]> = {};
  for (const day of Object.keys(columns)) {
    columns[day].forEach((card, index) => {
      (draft[card.animeId] ??= []).push({ dia: day, orden: index + 1 });
    });
  }
  for (const card of rail) {
    if (draft[card.animeId] === undefined && card.section !== '') {
      draft[card.animeId] = [{ dia: card.section, orden: card.orden }];
    }
  }
  return draft;
}

/** serializeDraft is buildDraft rendered as the JSON string the backend persists. */
export function serializeDraft(
  columns: Record<string, readonly OrderingCard[]>,
  rail: readonly OrderingCard[],
): string {
  return JSON.stringify(buildDraft(columns, rail));
}

/** initialWorkingState builds the editable working state from a loaded board. */
export function initialWorkingState(board: OrderingBoard): WorkingState {
  return { rail: [...board.rail], columns: groupGridByDay(board.grid) };
}

/** findCard returns a representative card for an anime (rail or any day clone) to copy metadata. */
function findCard(state: WorkingState, animeId: string): OrderingCard | undefined {
  const inRail = state.rail.find((c) => c.animeId === animeId);
  if (inRail !== undefined) {
    return inRail;
  }
  for (const day of WEEKDAYS) {
    const found = state.columns[day].find((c) => c.animeId === animeId);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/** cardCount totals an anime's cards across the rail and every weekday column. */
export function cardCount(state: WorkingState, animeId: string): number {
  let total = state.rail.filter((c) => c.animeId === animeId).length;
  for (const day of WEEKDAYS) {
    total += state.columns[day].filter((c) => c.animeId === animeId).length;
  }
  return total;
}

/**
 * duplicate stages a logical copy of an already-placed anime into the rail (same
 * animeId — never a second DB anime) so it can be dragged onto another weekday.
 * No-op when a pending copy already waits in the rail.
 */
export function duplicate(state: WorkingState, animeId: string): WorkingState {
  if (state.rail.some((c) => c.animeId === animeId)) {
    return state;
  }
  const card = findCard(state, animeId);
  if (card === undefined) {
    return state;
  }
  return { rail: [...state.rail, { ...card, dia: RAIL }], columns: state.columns };
}

/**
 * removeCard deletes one card of an anime from a location (a weekday or the rail).
 * Guarded by the minimum-one rule: the anime's last remaining card can never be
 * deleted — it must always sit somewhere.
 */
export function removeCard(state: WorkingState, animeId: string, location: string): WorkingState {
  if (cardCount(state, animeId) <= 1) {
    return state;
  }
  if (location === RAIL) {
    if (!state.rail.some((c) => c.animeId === animeId)) {
      return state;
    }
    return { rail: state.rail.filter((c) => c.animeId !== animeId), columns: state.columns };
  }
  if (state.columns[location] === undefined || !state.columns[location].some((c) => c.animeId === animeId)) {
    return state;
  }
  return {
    rail: state.rail,
    columns: { ...state.columns, [location]: renumber(state.columns[location].filter((c) => c.animeId !== animeId)) },
  };
}

/**
 * moveClone is the single drag-and-drop primitive: it relocates one card from a
 * source location to a target (a weekday, or the rail to unplace) at the drop
 * position. Drag changes BOTH day and order. Dropping onto a day that already holds
 * the anime is rejected (no two copies per day); dropping within the same day
 * reorders. Renumbers the touched columns.
 */
export function moveClone(
  state: WorkingState,
  animeId: string,
  source: string,
  target: string,
  index: number,
): WorkingState {
  const card = findCard(state, animeId);
  if (card === undefined) {
    return state;
  }
  if (target !== RAIL && state.columns[target] === undefined) {
    return state;
  }
  if (target !== RAIL && source !== target && state.columns[target].some((c) => c.animeId === animeId)) {
    return state; // no two copies of the same anime on one day
  }

  let rail = state.rail;
  let columns = state.columns;
  if (source === RAIL) {
    rail = rail.filter((c) => c.animeId !== animeId);
  } else {
    columns = { ...columns, [source]: renumber(columns[source].filter((c) => c.animeId !== animeId)) };
  }

  if (target === RAIL) {
    rail = rail.some((c) => c.animeId === animeId) ? rail : [...rail, { ...card, dia: RAIL }];
    return { rail, columns };
  }
  const column = columns[target].filter((c) => c.animeId !== animeId);
  const clamped = Math.max(0, Math.min(index, column.length));
  column.splice(clamped, 0, { ...card, dia: target });
  return { rail, columns: { ...columns, [target]: renumber(column) } };
}

/**
 * countChanges reports how many animes' placement SET differs from the loaded board.
 * Both sides are normalized through buildDraft (renumbered per day) so a stable
 * layout diffs to zero regardless of stored orden gaps — multi-day aware.
 */
export function countChanges(
  board: OrderingBoard,
  columns: Record<string, readonly OrderingCard[]>,
  rail: readonly OrderingCard[],
): number {
  const initial = initialWorkingState(board);
  const original = buildDraft(initial.columns, initial.rail);
  const working = buildDraft(columns, rail);
  const key = (placements: readonly DraftPlacement[]): string =>
    placements
      .map((p) => `${p.dia}#${p.orden}`)
      .toSorted()
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
