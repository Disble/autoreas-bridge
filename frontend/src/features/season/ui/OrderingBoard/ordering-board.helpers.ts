import type { OrderingBoard, OrderingCard } from '../../../../infrastructure/season-source';
import { WEEKDAYS } from './ordering-board.constants';
import type { DraftPlacement, WorkingState } from './ordering-board.types';

/**
 * groupGridByDay groups the grid cards into the seven weekday columns, each sorted
 * by orden ascending. Every weekday key is always present (empty columns render).
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
 * serializeDraft builds the ordering draft JSON (`{animeId: [{dia, orden}]}`): grid
 * cards get their weekday + renumbered position; rail cards get their current
 * Estrenos section placement (so an unmoved rail card diffs to no change, and a
 * card returned from a weekday is scheduled back to its section).
 */
export function serializeDraft(
  columns: Record<string, readonly OrderingCard[]>,
  rail: readonly OrderingCard[],
): string {
  const draft: Record<string, DraftPlacement[]> = {};
  for (const day of Object.keys(columns)) {
    columns[day].forEach((card, index) => {
      draft[card.animeId] = [{ dia: day, orden: index + 1 }];
    });
  }
  for (const card of rail) {
    draft[card.animeId] = [{ dia: card.section, orden: card.orden }];
  }
  return JSON.stringify(draft);
}

/** initialWorkingState builds the editable working state from a loaded board. */
export function initialWorkingState(board: OrderingBoard): WorkingState {
  return { rail: [...board.rail], columns: groupGridByDay(board.grid) };
}

/** removeCard strips an anime from wherever it sits, returning the card + the rest. */
function removeCard(state: WorkingState, animeId: string): { card?: OrderingCard; state: WorkingState } {
  const railCard = state.rail.find((c) => c.animeId === animeId);
  if (railCard !== undefined) {
    return { card: railCard, state: { rail: state.rail.filter((c) => c.animeId !== animeId), columns: state.columns } };
  }
  for (const day of WEEKDAYS) {
    const found = state.columns[day].find((c) => c.animeId === animeId);
    if (found !== undefined) {
      const columns = { ...state.columns, [day]: state.columns[day].filter((c) => c.animeId !== animeId) };
      return { card: found, state: { rail: state.rail, columns } };
    }
  }
  return { card: undefined, state };
}

/** moveToDay places an anime at the end of a weekday column (renumbered). */
export function moveToDay(state: WorkingState, animeId: string, day: string): WorkingState {
  const { card, state: rest } = removeCard(state, animeId);
  if (card === undefined || rest.columns[day] === undefined) {
    return state;
  }
  const target = renumber([...rest.columns[day], { ...card, dia: day }]);
  return { rail: rest.rail, columns: { ...rest.columns, [day]: target } };
}

/** returnToRail sends an anime back to the rail (awaiting placement). */
export function returnToRail(state: WorkingState, animeId: string): WorkingState {
  const { card, state: rest } = removeCard(state, animeId);
  if (card === undefined) {
    return state;
  }
  return { rail: [...rest.rail, { ...card, dia: '' }], columns: rest.columns };
}

/** moveWithinDay swaps an anime with its neighbour in its column, renumbering. */
export function moveWithinDay(state: WorkingState, animeId: string, direction: 'up' | 'down'): WorkingState {
  for (const day of WEEKDAYS) {
    const column = state.columns[day];
    const index = column.findIndex((c) => c.animeId === animeId);
    if (index === -1) {
      continue;
    }
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= column.length) {
      return state;
    }
    const next = [...column];
    [next[index], next[target]] = [next[target], next[index]];
    return { rail: state.rail, columns: { ...state.columns, [day]: renumber(next) } };
  }
  return state;
}

/**
 * countChanges reports how many animes' working placement differs from the loaded
 * board — the "N changes" the confirm action will write.
 */
export function countChanges(
  board: OrderingBoard,
  columns: Record<string, readonly OrderingCard[]>,
  rail: readonly OrderingCard[],
): number {
  const original: Record<string, string> = {};
  for (const card of board.grid) {
    original[card.animeId] = `${card.dia}#${card.orden}`;
  }
  for (const card of board.rail) {
    original[card.animeId] = `${card.section}#${card.orden}`;
  }

  const working = JSON.parse(serializeDraft(columns, rail)) as Record<string, DraftPlacement[]>;
  let changes = 0;
  for (const animeId of Object.keys(working)) {
    const p = working[animeId][0];
    if (original[animeId] !== `${p.dia}#${p.orden}`) {
      changes += 1;
    }
  }
  return changes;
}
