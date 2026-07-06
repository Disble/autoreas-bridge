import type { SeasonAnimeRow } from '../../../../infrastructure/season-source';
import type { DailyBoardGroups } from './daily-board.types';

/**
 * Groups season intake rows by daily actionability: created animes (stageable),
 * matched animes still waiting for chapter 1, and everything else. A row is
 * counted in exactly one group, created taking precedence.
 */
export function groupDailyBoard(rows: readonly SeasonAnimeRow[]): DailyBoardGroups {
  const created: SeasonAnimeRow[] = [];
  const waiting: SeasonAnimeRow[] = [];
  const other: SeasonAnimeRow[] = [];

  for (const row of rows) {
    if (row.availability === 'created') {
      created.push(row);
    } else if (row.matchStatus === 'matched' && row.availability === 'waiting') {
      waiting.push(row);
    } else {
      other.push(row);
    }
  }

  return { created, waiting, other };
}
