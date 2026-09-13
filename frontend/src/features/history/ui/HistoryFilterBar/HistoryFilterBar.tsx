import { LabeledSelect } from '../../../../shared/ui/LabeledSelect';
import {
  HISTORY_FILTER_BAR_SORT_ARIA_LABEL,
  HISTORY_FILTER_BAR_SORT_FALLBACK_VALUE,
  HISTORY_FILTER_BAR_SORT_OPTIONS,
} from './history-filter-bar.constants';
import type { HistoryFilterBarProps } from './history-filter-bar.types';

/**
 * Dumb filter bar for the History surface (design D5, D6). This unit renders
 * the Sort control only -- Search, Status, and Type land beside it in a
 * later unit, the Watched range after that. No Wails calls, no `useEffect`;
 * every control is driven entirely by props from the parent's
 * `useHistoryParams` (CLAUDE.md FE #1).
 */
export function HistoryFilterBar({ order, onSortChange }: Readonly<HistoryFilterBarProps>) {
  return (
    <section aria-label="History filters" className="flex flex-row flex-wrap items-center gap-3">
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
