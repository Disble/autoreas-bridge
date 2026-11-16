import type { SeasonAnimeRow, SeasonMatchingProgressNotice } from '../../../../shared/contracts/season.types';

/**
 * Overlays this run's progress on the authoritative query rows without changing
 * the query or reviving rows that are no longer present.
 * @param rows The most recently read rows.
 * @param progress The latest progress notice per row in the active run.
 * @returns The displayed rows.
 */
export function mergeIntakeMatchingProgress(
  rows: readonly SeasonAnimeRow[],
  progress: Readonly<Record<string, SeasonMatchingProgressNotice>>,
): readonly SeasonAnimeRow[] {
  return rows.map((row) => {
    const notice = progress[row.id];
    if (notice === undefined) return row;
    return {
      ...row,
      rawName: notice.rawName,
      matchStatus: notice.matchStatus,
      matchedSlug: notice.matchedSlug,
      candidates: notice.candidates,
      availability: notice.availability,
      availableEpisodes: notice.availableEpisodes,
    };
  });
}
