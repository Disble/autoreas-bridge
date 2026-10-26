import { useMemo } from 'react';
import type { SeasonAnimeRow } from '../../../../infrastructure/season-source/season-source.types';
import type { SeasonCoverSource } from '../SeasonCoverThumb/season-cover-thumb.types';
import { useSeasonCovers } from '../SeasonCoverThumb/use-season-covers';
import { toSelectionRows } from './selection-board.helpers';

/**
 * useSelectionCandidates derives the selection list from the season rows: the
 * created candidates approved-first with their live verdicts plus one cover per
 * candidate, each resolved at most once. The view criteria are the board's, so
 * this hook always returns every candidate and covers never re-resolve on a filter.
 *
 * @param seasonAnimes The season's rows, as the season store holds them.
 * @param minApprovalGrade The grade cutoff the verdicts derive against.
 * @param coverSource The port each candidate's cover is resolved through.
 * @returns The candidate rows and each row's cover thumbnail.
 */
export function useSelectionCandidates(seasonAnimes: readonly SeasonAnimeRow[], minApprovalGrade: number, coverSource: SeasonCoverSource) {
  // 5. Derived State (useMemo)
  const rows = useMemo(() => toSelectionRows(seasonAnimes, minApprovalGrade), [seasonAnimes, minApprovalGrade]);
  const animeIds = useMemo(() => rows.map((row) => row.animeId), [rows]);
  const getCoverThumb = useSeasonCovers(animeIds, coverSource);

  return { rows, getCoverThumb };
}
