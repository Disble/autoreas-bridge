import type { OrderingBoard, OrderingCard } from '../../../../infrastructure/season-source';
import { WEEKDAYS } from './ordering-board.constants';
import type { DraftPlacement } from './ordering-board.types';

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
    draft[card.animeId] = [{ dia: card.section, orden: card.orden > 0 ? card.orden : 1 }];
  }
  return JSON.stringify(draft);
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
