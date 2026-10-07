import type { SeasonAnimeRow } from '../../../../infrastructure/season-source/season-source.types';
import { WEEKDAY_SECTIONS } from './daily-board.constants';
import type { BoardSections, DailyBoardRowChip } from './daily-board.types';

/**
 * Groups the CREATED season animes by their live Estrenos section. Only created
 * animes reach the Daily Board; an unknown/empty section falls into Sin ver.
 * A weekday section means the anime graduated (its schedule was applied): it
 * lists under Visto — its last conveyor state — never back in the Sin ver pool.
 */
export function groupCreatedBySection(rows: readonly SeasonAnimeRow[]): BoardSections {
  const sinVer: SeasonAnimeRow[] = [];
  const verHoy: SeasonAnimeRow[] = [];
  const visto: SeasonAnimeRow[] = [];

  for (const row of rows) {
    if (row.availability !== 'created') {
      continue;
    }
    switch (row.section) {
      case 'Ver hoy':
        verHoy.push(row);
        break;
      case 'Visto':
        visto.push(row);
        break;
      default:
        (WEEKDAY_SECTIONS.has(row.section) ? visto : sinVer).push(row);
        break;
    }
  }

  return { sinVer, verHoy, visto };
}

/**
 * Returns the weekday (plus its orden when known, e.g. "Domingo - 2") a graduated
 * row is scheduled on, or null while the row still lives in an Estrenos section
 * (or has no section yet).
 */
export function getScheduledDay(row: SeasonAnimeRow): string | null {
  if (!WEEKDAY_SECTIONS.has(row.section)) {
    return null;
  }
  return row.sectionOrder >= 1 ? `${row.section} - ${row.sectionOrder}` : row.section;
}

/**
 * The accent weekday chip a Ver hoy row renders ("Jueves - 3"), or null while
 * the row is not scheduled on a weekday.
 *
 * @param row The Ver hoy row.
 * @returns The chip, or null for none.
 */
export function getScheduledDayChip(row: SeasonAnimeRow): DailyBoardRowChip | null {
  const scheduledDay = getScheduledDay(row);
  return scheduledDay === null ? null : { label: scheduledDay, color: 'accent' };
}

/**
 * Formats a Sin-ver row's available episode count for display, singularizing
 * "episode" for a count of exactly one.
 */
export function formatAvailableEpisodes(count: number): string {
  return `${count} episode${count === 1 ? '' : 's'} available`;
}

/**
 * Lists the anime id of every board row, Sin ver then Ver hoy then Visto, so
 * the board can ask for each row's cover.
 *
 * @param sections The board's created rows, grouped by section.
 * @returns The rows' anime ids in render order, duplicates and empty ids kept.
 */
export function listBoardAnimeIds(sections: BoardSections): string[] {
  return [...sections.sinVer, ...sections.verHoy, ...sections.visto].map((row) => row.animeId);
}

/**
 * Whether a conveyor section card renders: an open season shows a section only
 * once it holds an anime, so the board grows as the season progresses; a
 * read-only season always shows all three, so nothing feels hidden.
 *
 * @param readOnly Whether the season is closed (read-only).
 * @param count How many rows the section holds.
 * @returns Whether to render the section's card.
 */
export function isDailyBoardSectionShown(readOnly: boolean, count: number): boolean {
  return readOnly || count > 0;
}

/**
 * Whether any created anime reached the board, in any section.
 *
 * @param sections The board's created rows, grouped by section.
 * @returns Whether at least one section holds a row.
 */
export function hasBoardRows(sections: BoardSections): boolean {
  return sections.sinVer.length + sections.verHoy.length + sections.visto.length > 0;
}
