import type { SeasonAnimeRow } from '../../../../infrastructure/season-source/season-source.types';
import { WEEKDAY_SECTIONS } from './daily-board.constants';
import type { BoardSections } from './daily-board.types';

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
 * Formats a Sin-ver row's available episode count for display, singularizing
 * "episode" for a count of exactly one.
 */
export function formatAvailableEpisodes(count: number): string {
  return `${count} episode${count === 1 ? '' : 's'} available`;
}

/**
 * The availability indicator for an already-created Sin-ver row: 'success'
 * (green) once at least one episode is online, 'danger' (red) while none are.
 * Distinct from IntakePanel's indicator (ADR-2): these rows are already
 * created, so "Available to create" / "Waiting for episode 1" wording is wrong.
 */
export function getSinVerAvailabilityIndicator(row: SeasonAnimeRow): { color: 'success' | 'danger'; label: string } {
  return row.availableEpisodes >= 1
    ? { color: 'success', label: formatAvailableEpisodes(row.availableEpisodes) }
    : { color: 'danger', label: 'No episodes online yet' };
}
