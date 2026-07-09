import type { SeasonAnimeRow } from '../../../../infrastructure/season-source';
import type { BoardSections } from './daily-board.types';

/**
 * Groups the CREATED season animes by their live Estrenos section. Only created
 * animes reach the Daily Board; an unknown/empty section falls into Sin ver.
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
        sinVer.push(row);
        break;
    }
  }

  return { sinVer, verHoy, visto };
}

/**
 * Formats a Sin-ver row's available chapter count for display, singularizing
 * "chapter" for a count of exactly one.
 */
export function formatAvailableChapters(count: number): string {
  return `${count} chapter${count === 1 ? '' : 's'} available`;
}

/**
 * The availability indicator for an already-created Sin-ver row: 'success'
 * (green) once at least one chapter is online, 'danger' (red) while none are.
 * Distinct from IntakePanel's indicator (ADR-2): these rows are already
 * created, so "Available to create" / "Waiting for chapter 1" wording is wrong.
 */
export function getSinVerAvailabilityIndicator(row: SeasonAnimeRow): { color: 'success' | 'danger'; label: string } {
  return row.availableChapters >= 1
    ? { color: 'success', label: formatAvailableChapters(row.availableChapters) }
    : { color: 'danger', label: 'No chapters online yet' };
}
