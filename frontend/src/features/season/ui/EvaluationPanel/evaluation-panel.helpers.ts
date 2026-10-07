import type { SeasonAnimeRow } from '../../../../infrastructure/season-source/season-source.types';
import { EVALUATION_NOT_RATED_META } from './evaluation-panel.constants';
import type { EvaluationListItem, EvaluationRow, EvaluationView, GradeChip } from './evaluation-panel.types';

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
  return rows.filter(isPendingGrade).length;
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

/**
 * getGradeChip maps a candidate's first-episode grade state to its chip: a grade
 * (1–6) wins over a skip, a skip reads as "Skipped", anything else is still
 * ungraded. Shared by the Evaluation list and the Daily board's Visto rows so
 * the two never disagree.
 */
export function getGradeChip({ grade, skipGrading }: Pick<EvaluationRow, 'grade' | 'skipGrading'>): GradeChip {
  if (grade >= 1) {
    return { label: `Grade ${grade}`, color: 'success' };
  }
  return skipGrading ? { label: 'Skipped', color: 'default' } : { label: 'No grade', color: 'warning' };
}

/**
 * Projects the candidates into the rows the Evaluation list renders, ungraded
 * ones first so what still needs a grade leads the list. Each group keeps the
 * order it arrived in.
 *
 * @param rows The created candidates, in season order.
 * @returns The list rows: pending first, then graded or skipped.
 */
export function toEvaluationListItems(rows: readonly EvaluationRow[]): EvaluationListItem[] {
  const items = rows.map((row): EvaluationListItem => {
    const isPending = isPendingGrade(row);
    return { row, isPending, meta: isPending ? EVALUATION_NOT_RATED_META : formatGradeMeta(row), chip: getGradeChip(row) };
  });
  return [...items.filter((item) => item.isPending), ...items.filter((item) => !item.isPending)];
}

/**
 * Derives the Evaluation list from the season rows: the created candidates as
 * list rows (ungraded first), the ungraded count, and the cover ids.
 *
 * @param seasonAnimes The season's rows, as the season store holds them.
 * @returns The list rows, the ungraded count and the anime ids to cover.
 */
export function buildEvaluationView(seasonAnimes: readonly SeasonAnimeRow[]): EvaluationView {
  const rows = toEvaluationRows(seasonAnimes);
  const items = toEvaluationListItems(rows);
  return { items, ungradedCount: countUngraded(rows), animeIds: items.map((item) => item.row.animeId) };
}

/**
 * Whether a candidate still lacks a grade and was not explicitly skipped.
 *
 * @param row The candidate.
 * @returns True while the candidate would derive as not-approved at selection.
 */
function isPendingGrade(row: EvaluationRow): boolean {
  return row.grade < 1 && !row.skipGrading;
}

/**
 * The meta line of a graded or skipped candidate: its capture source, when
 * known, then the grade date.
 *
 * @param row The candidate.
 * @returns "Source · date", or the date alone when there is no source.
 */
function formatGradeMeta(row: EvaluationRow): string {
  const sourceLabel = getGradeSourceLabel(row.gradeSource);
  const ratedAt = formatRatedAt(row.ratedAt);
  return sourceLabel === '' ? ratedAt : `${sourceLabel} · ${ratedAt}`;
}
