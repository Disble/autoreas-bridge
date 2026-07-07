import type { SeasonAnimeCandidate, SeasonAnimeRow } from '../../../../infrastructure/season-source';
import { MATCH_STATUS_LABELS } from './intake-panel.constants';
import type { IntakeChipColor } from './intake-panel.types';

/**
 * Returns a readable label for an intake match status, falling back to the raw
 * value for any unrecognized status.
 */
export function getMatchStatusLabel(status: string): string {
  return MATCH_STATUS_LABELS[status] ?? status;
}

/**
 * Semantic chip color per match status: matched=success, ambiguous=warning,
 * not_found=danger, everything else neutral.
 */
export function getMatchStatusColor(status: string): IntakeChipColor {
  switch (status) {
    case 'matched':
      return 'success';
    case 'ambiguous':
      return 'warning';
    case 'not_found':
      return 'danger';
    default:
      return 'default';
  }
}

/**
 * Formats a candidate as a pickable option: its title plus its similarity score
 * as a rounded percentage.
 */
export function formatCandidateOption(candidate: SeasonAnimeCandidate): string {
  return `${candidate.title} (${Math.round(candidate.score * 100)}%)`;
}

/**
 * Counts intake rows still needing attention (pending or ambiguous), used to
 * surface how much of the list is unresolved.
 */
export function countUnresolved(rows: readonly SeasonAnimeRow[]): number {
  return rows.filter((row) => row.matchStatus === 'pending' || row.matchStatus === 'ambiguous').length;
}

/**
 * An intake row is EDITABLE (part of the raw text) only while it is still just a
 * name: not yet created and not discarded. Created rows have a real anime record
 * and graduate out of the freely-editable raw document.
 */
export function isEditableRow(row: SeasonAnimeRow): boolean {
  return row.availability !== 'created' && row.matchStatus !== 'discarded';
}

/**
 * A matched row is CREATABLE once its chapter 1 is online (availability
 * 'available'). Creation is an explicit, user-picked action — the availability
 * watch never creates on its own.
 */
export function isCreatableRow(row: SeasonAnimeRow): boolean {
  return row.matchStatus === 'matched' && row.availability === 'available';
}

/**
 * The availability indicator for a matched row: 'success' (green) once it can be
 * created, 'danger' (red) while its first chapter is not online yet. Returns null
 * for rows still being matched (their match-status chip conveys their state).
 */
export function getAvailabilityIndicator(row: SeasonAnimeRow): { color: 'success' | 'danger'; label: string } | null {
  if (row.matchStatus !== 'matched') {
    return null;
  }
  return row.availability === 'available'
    ? { color: 'success', label: 'Available to create' }
    : { color: 'danger', label: 'Waiting for chapter 1' };
}

/**
 * Builds the raw editor text from the editable (uncreated, non-discarded) rows:
 * one name per line. Created rows are never part of the raw document.
 */
export function buildRawText(rows: readonly SeasonAnimeRow[]): string {
  const names: string[] = [];
  for (const row of rows) {
    if (isEditableRow(row)) {
      names.push(row.rawName);
    }
  }
  return names.join('\n');
}

/**
 * Splits intake rows for the List view: editable rows (still names) and created
 * rows (read-only, shown for the global picture). Discarded rows are dropped.
 */
export function splitIntakeRows(rows: readonly SeasonAnimeRow[]): {
  editable: readonly SeasonAnimeRow[];
  created: readonly SeasonAnimeRow[];
} {
  const editable: SeasonAnimeRow[] = [];
  const created: SeasonAnimeRow[] = [];
  for (const row of rows) {
    if (row.availability === 'created') {
      created.push(row);
    } else if (row.matchStatus !== 'discarded') {
      editable.push(row);
    }
  }
  return { editable, created };
}
