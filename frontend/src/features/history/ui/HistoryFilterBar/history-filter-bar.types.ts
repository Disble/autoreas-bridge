import type { WatchHistoryOrder } from '../../../../shared/contracts/anime.types';

/**
 * A local calendar-day watched range as `YYYY-MM-DD` strings, both bounds
 * inclusive in the UI and converted to half-open epoch millis on the wire
 * (design D4).
 */
export interface HistoryDateRange {
  /** Inclusive local start day, `YYYY-MM-DD`. */
  readonly from: string;
  /** Inclusive local end day, `YYYY-MM-DD`. */
  readonly to: string;
}

/**
 * The History surface's full filter and selection state, decoded from and
 * encoded to the `/history` URL search params (design D5). Every field is
 * omitted from the URL at its default value: `search` `''`, `status`/`type`
 * unset (All), no `range`, `order` `'newest'`, no `animeId`/`rowId`.
 */
export interface HistoryParams {
  /** Trimmed free-text name search; `''` means not applied. */
  readonly search: string;
  /** The anime's CURRENT numeric status (0-3); unset means All. */
  readonly status?: number;
  /** The anime's CURRENT numeric type/kind (0-3); unset means All. */
  readonly type?: number;
  /** The watched-date range filter; unset means unbounded. */
  readonly range?: HistoryDateRange;
  /** Paging order for both days and rows within a day. */
  readonly order: WatchHistoryOrder;
  /** The anime ID the inspector is keyed to; unset means nothing selected. */
  readonly animeId?: string;
  /** The highlighted row's ID, meaningful only alongside `animeId`. */
  readonly rowId?: number;
}

/**
 * Which animes a Status/Type filter narrows the history read to (design D2).
 * `'all'` sends no `animeIds` filter; `'ids'` narrows to that exact set;
 * `'none'` means the filter matched nothing in the catalog, so the caller
 * must render the filtered-empty state and skip the read entirely.
 */
export type HistoryAnimeScope =
  | { readonly kind: 'all' }
  | { readonly kind: 'ids'; readonly ids: readonly string[] }
  | { readonly kind: 'none' };

/**
 * Props for `HistoryFilterBar` (design D5, D6): a dumb component -- no Wails
 * calls, no `useEffect` (CLAUDE.md FE #1). Search, Status, and Type land in
 * this unit; the Watched range control lands in a later one. The caller owns
 * the search draft's debounce and every write to the URL.
 */
export interface HistoryFilterBarProps {
  /** The active sort order, rendered as the Sort control's selected value. */
  readonly order: WatchHistoryOrder;
  /** Called with the newly selected sort order. */
  readonly onSortChange: (order: WatchHistoryOrder) => void;
  /** The Search control's current draft text, rendered as-is on every keystroke. */
  readonly search: string;
  /** Called immediately with the newly typed Search text; the caller decides when to commit it. */
  readonly onSearchChange: (search: string) => void;
  /** The active Status filter, or `undefined` for "All". */
  readonly status: number | undefined;
  /** Called with the newly selected Status filter, or `undefined` for "All". */
  readonly onStatusChange: (status: number | undefined) => void;
  /** The active Type filter, or `undefined` for "All". */
  readonly type: number | undefined;
  /** Called with the newly selected Type filter, or `undefined` for "All". */
  readonly onTypeChange: (type: number | undefined) => void;
  /** The active watched-date range, or `undefined` for unbounded. */
  readonly range: HistoryDateRange | undefined;
  /**
   * Called with the newly picked range as one complete `{from, to}` write
   * (design D5), or `undefined` when cleared. An edit that leaves the range
   * incomplete or inverted (`from > to`) is never reported (design D4).
   */
  readonly onRangeChange: (range: HistoryDateRange | undefined) => void;
}
