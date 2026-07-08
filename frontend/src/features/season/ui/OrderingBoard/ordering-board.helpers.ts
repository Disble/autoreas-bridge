import type { OrderingBoard, OrderingCard } from '../../../../infrastructure/season-source';
import { WEEKDAYS } from './ordering-board.constants';
import type { DraftPlacement, WorkingState } from './ordering-board.types';

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
 * renumbered by column position; rail cards get their current Estrenos section
 * placement (so an unmoved rail card diffs to no change).
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
    draft[card.animeId] = [{ dia: card.section, orden: card.orden }];
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

/** isPlaced reports whether the anime has at least one weekday clone. */
function isPlaced(columns: Record<string, readonly OrderingCard[]>, animeId: string): boolean {
  return WEEKDAYS.some((day) => (columns[day] ?? []).some((c) => c.animeId === animeId));
}

/**
 * addToDay places an anime as a clone on a weekday at a given position (clamped),
 * WITHOUT removing it from its other days — that is how an anime becomes multi-day.
 * Adding to a day it already sits on reorders that day's clone. Leaves the rail.
 */
export function addToDay(state: WorkingState, animeId: string, day: string, index: number): WorkingState {
  if (state.columns[day] === undefined) {
    return state;
  }
  const card = findCard(state, animeId);
  if (card === undefined) {
    return state;
  }
  const rail = state.rail.filter((c) => c.animeId !== animeId);
  const column = state.columns[day].filter((c) => c.animeId !== animeId);
  const clamped = Math.max(0, Math.min(index, column.length));
  column.splice(clamped, 0, { ...card, dia: day });
  return { rail, columns: { ...state.columns, [day]: renumber(column) } };
}

/**
 * removeFromDay removes a single day's clone of an anime. When it was the anime's
 * last weekday placement, the anime returns to the rail (awaiting placement again).
 */
export function removeFromDay(state: WorkingState, animeId: string, day: string): WorkingState {
  if (state.columns[day] === undefined) {
    return state;
  }
  const card = state.columns[day].find((c) => c.animeId === animeId);
  if (card === undefined) {
    return state;
  }
  const columns = { ...state.columns, [day]: renumber(state.columns[day].filter((c) => c.animeId !== animeId)) };
  const rail = isPlaced(columns, animeId) ? state.rail : [...state.rail, { ...card, dia: '' }];
  return { rail, columns };
}

/**
 * moveClone relocates a single clone (drag-and-drop). From the rail (sourceDay '')
 * or another day it removes the source placement and inserts into targetDay at the
 * drop position; within the same day it reorders. Other days are untouched.
 */
export function moveClone(
  state: WorkingState,
  animeId: string,
  sourceDay: string,
  targetDay: string,
  index: number,
): WorkingState {
  const card = findCard(state, animeId);
  if (card === undefined || state.columns[targetDay] === undefined) {
    return state;
  }
  let rail = state.rail;
  let columns = state.columns;
  if (sourceDay === '') {
    rail = rail.filter((c) => c.animeId !== animeId);
  } else if (sourceDay !== targetDay && columns[sourceDay] !== undefined) {
    columns = { ...columns, [sourceDay]: renumber(columns[sourceDay].filter((c) => c.animeId !== animeId)) };
  }
  const target = columns[targetDay].filter((c) => c.animeId !== animeId);
  const clamped = Math.max(0, Math.min(index, target.length));
  target.splice(clamped, 0, { ...card, dia: targetDay });
  return { rail, columns: { ...columns, [targetDay]: renumber(target) } };
}

/** moveWithinDay swaps an anime with its neighbour in a specific column, renumbering. */
export function moveWithinDay(
  state: WorkingState,
  animeId: string,
  day: string,
  direction: 'up' | 'down',
): WorkingState {
  const column = state.columns[day];
  if (column === undefined) {
    return state;
  }
  const index = column.findIndex((c) => c.animeId === animeId);
  if (index === -1) {
    return state;
  }
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= column.length) {
    return state;
  }
  const next = [...column];
  [next[index], next[target]] = [next[target], next[index]];
  return { rail: state.rail, columns: { ...state.columns, [day]: renumber(next) } };
}

/**
 * countChanges reports how many animes' placement SET differs from the loaded board.
 * Both sides are normalized through serializeDraft (renumbered per day) so a stable
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
