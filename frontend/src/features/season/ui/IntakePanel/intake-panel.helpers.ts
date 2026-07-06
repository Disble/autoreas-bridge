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
