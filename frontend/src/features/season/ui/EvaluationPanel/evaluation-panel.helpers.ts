import type { SeasonAnimeRow } from '../../../../infrastructure/season-source/season-source.types';
import type { EvaluationRow } from './evaluation-panel.types';

/**
 * toEvaluationRows narrows the season rows to created candidates (an anime was
 * created and linked) and projects the grade fields the Evaluation list shows.
 * Uncreated intake rows never reach evaluation.
 */
export function toEvaluationRows(rows: readonly SeasonAnimeRow[]): EvaluationRow[] {
  const out: EvaluationRow[] = [];
  for (const r of rows) {
    if (r.availability === 'created' && r.animeId !== '') {
      out.push({
        id: r.id,
        animeId: r.animeId,
        rawName: r.rawName,
        grade: r.grade,
        gradeSource: r.gradeSource,
        ratedAt: r.ratedAt,
        skipGrading: r.skipGrading,
      });
    }
  }
  return out;
}

/**
 * countUngraded returns how many candidates still lack a grade and have not been
 * explicitly skipped — the number that would derive as not-approved at selection.
 */
export function countUngraded(rows: readonly EvaluationRow[]): number {
  return rows.filter((r) => r.grade < 1 && !r.skipGrading).length;
}

/**
 * formatRatedAt renders the grade timestamp as a locale date, or an em dash when
 * the candidate has never been graded.
 */
export function formatRatedAt(ratedAt: number | undefined): string {
  if (ratedAt === undefined || ratedAt === 0) {
    return '—';
  }
  return new Date(ratedAt).toLocaleDateString();
}

/**
 * getGradeSourceLabel maps the grade source to a short badge label, or an empty
 * string when the candidate is ungraded.
 */
export function getGradeSourceLabel(gradeSource: string): string {
  if (gradeSource === 'mobile_sync') {
    return 'Mobile';
  }
  if (gradeSource === 'manual') {
    return 'Manual';
  }
  return '';
}
