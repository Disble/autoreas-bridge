import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import type { HistoryFilterBarProps } from '../HistoryFilterBar/history-filter-bar.types';
import { hasActiveHistoryFilters } from '../HistoryFilterBar/history-params.helpers';
import { useHistoryFilterBarSearch } from '../HistoryFilterBar/use-history-filter-bar';
import { useHistoryParams } from '../HistoryFilterBar/use-history-params';
import type { HistorySelectionState, HistoryTimelineState } from './history-timeline.types';
import { useHistorySelection } from './use-history-selection';
import { useHistoryTimeline } from './use-history-timeline';

/** Everything the History surface renders: the filter bar's props, the list, its selection, and the inspector. */
export interface HistoryScreenState extends HistoryTimelineState, HistorySelectionState {
  /** Props for `HistoryFilterBar`, wired to the URL (design D5). */
  readonly filterBar: HistoryFilterBarProps;
  /** True when a narrowing filter is set, so an empty result reads as "no match" (design D6). */
  readonly isFiltered: boolean;
  /** The URL-selected anime ID keying the inspector (design D8). */
  readonly inspectorAnimeId: string | undefined;
  /** Opens the inspected anime's detail (design D8). */
  readonly onOpenAnime: (animeId: string) => void;
}

/**
 * Composes the History surface (design D5-D7): URL params feed both the
 * filter bar and the page request, the Search draft commits to the URL once
 * debounced, and the `ListBox` selection round-trips through the URL.
 */
export function useHistoryScreen(): HistoryScreenState {
  // 3. Context/3rd Party Hooks
  const { params, setRange, setSearch, setSelection, setSort, setStatus, setType } = useHistoryParams();
  const navigate = useNavigate();
  const { debouncedSearch, draft, onDraftChange } = useHistoryFilterBarSearch(params.search);
  const timeline = useHistoryTimeline(params);
  const selection = useHistorySelection(timeline.groups, params.animeId, params.rowId, setSelection);

  // 6. Callbacks (useCallback calling pure helpers)
  const onOpenAnime = useCallback((animeId: string) => {
    void navigate(`/catalog/detail/${animeId}`);
  }, [navigate]);

  // 7. Effects
  useEffect(() => {
    if (debouncedSearch !== params.search) {
      setSearch(debouncedSearch);
    }
    // Only a settled draft commits. `params.search` and `setSearch` change on
    // every URL write, including Back; re-running on them would write the
    // still-lagging debounced draft over the restored `q`.
    // eslint-disable-next-line react-doctor/exhaustive-deps
  }, [debouncedSearch]);

  return {
    ...timeline,
    ...selection,
    filterBar: {
      order: params.order,
      onSortChange: setSort,
      search: draft,
      onSearchChange: onDraftChange,
      status: params.status,
      onStatusChange: setStatus,
      type: params.type,
      onTypeChange: setType,
      range: params.range,
      onRangeChange: setRange,
    },
    isFiltered: hasActiveHistoryFilters(params),
    inspectorAnimeId: params.animeId,
    onOpenAnime,
  };
}
