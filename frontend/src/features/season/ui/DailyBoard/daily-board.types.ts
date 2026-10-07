import type { ReactNode } from 'react';
import type { SeasonAnimeRow, SeasonDailyBoardEntry } from '../../../../infrastructure/season-source/season-source.types';
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

/**
 * Where a closed season's Daily board read stands. `live` is an open season
 * (the board follows live sections); a closed season is `loading` until its
 * closure snapshot is read, then `recorded` with the stored entries,
 * `unrecorded` when it closed before the Daily board was captured, or `failed`.
 */
export type DailyBoardHistory =
  | { readonly status: 'live' }
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly errorMessage: string }
  | { readonly status: 'recorded'; readonly entries: readonly SeasonDailyBoardEntry[] }
  | { readonly status: 'unrecorded' };

/** A settled closure-snapshot read, tagged with the season it belongs to. */
export interface LoadedDailyBoardHistory {
  /** The season the read was for. */
  readonly seasonId: string;
  /** The settled outcome of that read. */
  readonly history: DailyBoardHistory;
}

/**
 * What the board renders: the three conveyor sections, one plain list of the
 * season's animes (a closed season that recorded no Daily board), the loading
 * placeholder, or the read failure.
 */
export type DailyBoardMode = 'sections' | 'plain' | 'loading' | 'failed';

/** The board's render model, derived from the season rows and the history read. */
export interface DailyBoardView {
  /** Which board renders. */
  readonly mode: DailyBoardMode;
  /** The conveyor sections; empty unless the mode is `sections`. */
  readonly sections: BoardSections;
  /** The season's created animes in row order; empty unless the mode is `plain`. */
  readonly plainRows: readonly SeasonAnimeRow[];
  /** Why the closure snapshot could not be read, in the `failed` mode. */
  readonly historyError?: string;
}

/** Inputs of the plain list a closed season shows when it recorded no Daily board. */
export interface DailyBoardPlainCardProps {
  /** The season's created animes, in row order. */
  readonly rows: readonly SeasonAnimeRow[];
  /** Resolves an anime id to its thumbnail props. */
  readonly getCoverThumb: (animeId: string) => SeasonCoverThumbProps;
}
