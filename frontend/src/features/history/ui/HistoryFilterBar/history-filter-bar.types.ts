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
 * Props for `HistoryFilterBar` (design D5, D6): a dumb component -- no Wails
 * calls, no `useEffect` (CLAUDE.md FE #1). This unit renders the Sort
 * control only; Search/Status/Type land in a later unit, the Watched range
 * after that.
 */
export interface HistoryFilterBarProps {
  /** The active sort order, rendered as the Sort control's selected value. */
  readonly order: WatchHistoryOrder;
  /** Called with the newly selected sort order. */
  readonly onSortChange: (order: WatchHistoryOrder) => void;
}
