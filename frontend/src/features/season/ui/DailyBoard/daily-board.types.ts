import type { SeasonAnimeRow } from '../../../../infrastructure/season-source';

/**
 * Created season animes grouped by their live Estrenos section — the conveyor:
 * Sin ver (pick today) → Ver hoy (watching, drains automatically) → Visto.
 */
export interface BoardSections {
  readonly sinVer: readonly SeasonAnimeRow[];
  readonly verHoy: readonly SeasonAnimeRow[];
  readonly visto: readonly SeasonAnimeRow[];
}
