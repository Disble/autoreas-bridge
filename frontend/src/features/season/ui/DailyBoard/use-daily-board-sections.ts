import { useMemo } from 'react';
import type { SeasonAnimeRow } from '../../../../infrastructure/season-source/season-source.types';
import type { SeasonCoverSource, SeasonCoverThumbProps } from '../SeasonCoverThumb/season-cover-thumb.types';
import { useSeasonCovers } from '../SeasonCoverThumb/use-season-covers';
import { groupCreatedBySection, listBoardAnimeIds } from './daily-board.helpers';
import type { BoardSections } from './daily-board.types';

/**
 * Groups the season's created rows into the board's sections and resolves one
 * cover per board anime through the shared season cover seam, handing back the
 * sections and the lookup each row's thumbnail renders from.
 *
 * @param rows The season's rows, as the season store holds them.
 * @param source The port `getAnimeCover` is called through. Its absence (a
 * non-Wails context) degrades every requested id to the placeholder.
 * @returns The grouped sections, and the thumbnail props for an anime id.
 */
export function useDailyBoardSections(
  rows: readonly SeasonAnimeRow[],
  source: SeasonCoverSource,
): { readonly sections: BoardSections; readonly getCoverThumb: (animeId: string) => SeasonCoverThumbProps } {
  // 5. Derived State (useMemo)
  const sections = useMemo(() => groupCreatedBySection(rows), [rows]);
  const animeIds = useMemo(() => listBoardAnimeIds(sections), [sections]);
  const getCoverThumb = useSeasonCovers(animeIds, source);

  return { sections, getCoverThumb };
}
