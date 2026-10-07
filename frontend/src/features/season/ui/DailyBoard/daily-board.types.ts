import type { ReactNode } from 'react';
import type { SeasonAnimeRow } from '../../../../infrastructure/season-source/season-source.types';
import type { SeasonCoverThumbProps } from '../SeasonCoverThumb/season-cover-thumb.types';

/**
 * Created season animes grouped by their live Estrenos section — the conveyor:
 * Sin ver (pick today) → Ver hoy (watching, drains automatically) → Visto.
 */
export interface BoardSections {
  readonly sinVer: readonly SeasonAnimeRow[];
  readonly verHoy: readonly SeasonAnimeRow[];
  readonly visto: readonly SeasonAnimeRow[];
}

/** The copy of one conveyor section card. */
export interface DailyBoardSectionCopy {
  /** The section heading; the row count chip follows it. */
  readonly title: string;
  /** Guidance under the heading. */
  readonly description: string;
  /** Compact empty-state title, shown when the section has no rows. */
  readonly emptyTitle: string;
  /** Compact empty-state guidance, shown when the section has no rows. */
  readonly emptyDescription: string;
}

/**
 * Inputs of one conveyor section card (Sin ver, Ver hoy or Visto): the shared
 * header, the compact empty state shown when it has no rows, and its content.
 */
export interface DailyBoardSectionCardProps {
  /** The section's heading, description and empty-state copy. */
  readonly copy: DailyBoardSectionCopy;
  /** How many rows the section holds. */
  readonly count: number;
  /** The count chip's semantic color. */
  readonly countColor: 'default' | 'accent' | 'success';
  /** The section's rows, rendered when the count is above zero. */
  readonly children: ReactNode;
  /** Actions rendered under the content whatever the count. */
  readonly footer?: ReactNode;
}

/** Inputs of one read-only conveyor list (Ver hoy or Visto) showing every row at once. */
export interface DailyBoardWatchListProps {
  /** The list's accessible name: the section's data literal. */
  readonly label: string;
  /** Layout classes of the list: a single column, or a responsive grid. */
  readonly listClassName: string;
  /** The section's rows, in board order. */
  readonly rows: readonly SeasonAnimeRow[];
  /** Resolves an anime id to its thumbnail props. */
  readonly getCoverThumb: (animeId: string) => SeasonCoverThumbProps;
  /** The row's trailing chip, or null for none. */
  readonly getRowChip: (row: SeasonAnimeRow) => DailyBoardRowChip | null;
}

/** The trailing chip of one watch-list row: its label and semantic color. */
export interface DailyBoardRowChip {
  /** The chip's text. */
  readonly label: string;
  /** The chip's semantic color. */
  readonly color: 'accent' | 'success' | 'default' | 'warning';
}
