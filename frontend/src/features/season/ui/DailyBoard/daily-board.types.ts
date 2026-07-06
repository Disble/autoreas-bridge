import type { SeasonAnimeRow } from '../../../../infrastructure/season-source';

/** Props for the DailyBoard; all data flows through its hook. */
export interface DailyBoardProps {
  readonly className?: string;
}

/** Season intake rows grouped by what the user can do with them today. */
export interface DailyBoardGroups {
  /** Created in bridge — stageable across the Estrenos sections. */
  readonly created: readonly SeasonAnimeRow[];
  /** Matched but still waiting for chapter 1. */
  readonly waiting: readonly SeasonAnimeRow[];
  /** Everything else (unmatched / ambiguous / not found / discarded). */
  readonly other: readonly SeasonAnimeRow[];
}
