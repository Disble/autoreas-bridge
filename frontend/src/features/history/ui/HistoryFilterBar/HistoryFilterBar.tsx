import { SearchField } from '@heroui/react';
import { LabeledSelect } from '../../../../shared/ui/LabeledSelect';
import {
  HISTORY_FILTER_BAR_ALL_VALUE,
  HISTORY_FILTER_BAR_SEARCH_ARIA_LABEL,
  HISTORY_FILTER_BAR_SEARCH_PLACEHOLDER,
  HISTORY_FILTER_BAR_SORT_ARIA_LABEL,
  HISTORY_FILTER_BAR_SORT_FALLBACK_VALUE,
  HISTORY_FILTER_BAR_SORT_OPTIONS,
  HISTORY_FILTER_BAR_STATUS_ARIA_LABEL,
  HISTORY_FILTER_BAR_STATUS_OPTIONS,
  HISTORY_FILTER_BAR_TYPE_ARIA_LABEL,
  HISTORY_FILTER_BAR_TYPE_OPTIONS,
} from './history-filter-bar.constants';
import type { HistoryFilterBarProps } from './history-filter-bar.types';

/**
 * Dumb filter bar for the History surface (design D5, D6): Search, Status,
 * Type, and Sort. The Watched range control lands in a later unit. No Wails
 * calls, no `useEffect`; every control is driven entirely by props -- the
 * caller (a colocated hook) owns the Search draft's debounce and every write
 * to the URL (CLAUDE.md FE #1).
 */
export function HistoryFilterBar({
  onSearchChange,
  onSortChange,
  onStatusChange,
  onTypeChange,
  order,
  search,
  status,
  type,
}: Readonly<HistoryFilterBarProps>) {
  return (
    <section aria-label="History filters" className="flex flex-row flex-wrap items-center gap-3">
      <SearchField.Root
        aria-label={HISTORY_FILTER_BAR_SEARCH_ARIA_LABEL}
        className="min-w-60 flex-1"
        onChange={onSearchChange}
        value={search}
        variant="secondary"
      >
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder={HISTORY_FILTER_BAR_SEARCH_PLACEHOLDER} />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField.Root>
      <LabeledSelect
        ariaLabel={HISTORY_FILTER_BAR_STATUS_ARIA_LABEL}
        className="w-40"
        fallbackValue={HISTORY_FILTER_BAR_ALL_VALUE}
        label="Status"
        options={HISTORY_FILTER_BAR_STATUS_OPTIONS}
        placeholder="Status"
        value={status === undefined ? HISTORY_FILTER_BAR_ALL_VALUE : String(status)}
        variant="secondary"
        onChange={(value) => onStatusChange(value === HISTORY_FILTER_BAR_ALL_VALUE ? undefined : Number(value))}
      />
      <LabeledSelect
        ariaLabel={HISTORY_FILTER_BAR_TYPE_ARIA_LABEL}
        className="w-40"
        fallbackValue={HISTORY_FILTER_BAR_ALL_VALUE}
        label="Type"
        options={HISTORY_FILTER_BAR_TYPE_OPTIONS}
        placeholder="Type"
        value={type === undefined ? HISTORY_FILTER_BAR_ALL_VALUE : String(type)}
        variant="secondary"
        onChange={(value) => onTypeChange(value === HISTORY_FILTER_BAR_ALL_VALUE ? undefined : Number(value))}
      />
      <LabeledSelect
        ariaLabel={HISTORY_FILTER_BAR_SORT_ARIA_LABEL}
        className="w-40"
        fallbackValue={HISTORY_FILTER_BAR_SORT_FALLBACK_VALUE}
        label="Sort"
        options={HISTORY_FILTER_BAR_SORT_OPTIONS}
        placeholder="Sort"
        value={order}
        variant="secondary"
        onChange={(value) => onSortChange(value === 'oldest' ? 'oldest' : 'newest')}
      />
    </section>
  );
}
