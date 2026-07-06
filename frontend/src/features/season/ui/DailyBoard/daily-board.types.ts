import type { SeasonAnimeRow } from '../../../../infrastructure/season-source';

/** Props for the DailyBoard; all data flows through its hook. */
export interface DailyBoardProps {
  readonly className?: string;
}

/**
 * Created season animes grouped by their live Estrenos section — the conveyor:
 * Sin ver (pick today) → Ver hoy (watching, drains automatically) → Visto.
 */
export interface BoardSections {
  readonly sinVer: readonly SeasonAnimeRow[];
  readonly verHoy: readonly SeasonAnimeRow[];
  readonly visto: readonly SeasonAnimeRow[];
}
