import { DateField, DateRangePicker, RangeCalendar, SearchField } from '@heroui/react';
import type { DateValue, RangeValue } from '@heroui/react';
import { parseDate } from '@internationalized/date';
import { LabeledSelect } from '../../../../shared/ui/LabeledSelect';
import {
  HISTORY_FILTER_BAR_ALL_VALUE,
  HISTORY_FILTER_BAR_RANGE_ARIA_LABEL,
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
import type { HistoryDateRange, HistoryFilterBarProps } from './history-filter-bar.types';

/**
 * Reports a `DateRangePicker` value change as one `onRangeChange` write
 * (design D5): `null` (cleared) reports `undefined`. An edit can leave the
 * two `DateField`s independently set to an inverted range (`from > to`) --
 * editing one bound never re-orders the other (design D4) -- so that case is
 * ignored entirely: neither reported nor treated as a clear, leaving the
 * previously committed range untouched.
 * @param value The picker's new value, or `null` when cleared.
 * @param onRangeChange The bar's `onRangeChange` prop to report through.
 */
function reportRangeChange(
  value: RangeValue<DateValue> | null,
  onRangeChange: (range: HistoryDateRange | undefined) => void,
): void {
  if (value === null) {
    onRangeChange(undefined);
    return;
  }
  if (value.start.compare(value.end) > 0) {
    return;
  }

  onRangeChange({ from: value.start.toString(), to: value.end.toString() });
}

/**
 * Dumb filter bar for the History surface (design D5, D6): Search, Status,
 * Type, Sort, and the watched-date range. No Wails calls, no `useEffect`;
 * every control is driven entirely by props -- the caller (a colocated hook)
 * owns the Search draft's debounce and every write to the URL (CLAUDE.md FE
 * #1).
 */
export function HistoryFilterBar({
  onRangeChange,
  onSearchChange,
  onSortChange,
  onStatusChange,
  onTypeChange,
  order,
  range,
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
      <DateRangePicker
        aria-label={HISTORY_FILTER_BAR_RANGE_ARIA_LABEL}
        className="w-64"
        value={range === undefined ? null : { start: parseDate(range.from), end: parseDate(range.to) }}
        onChange={(value) => reportRangeChange(value, onRangeChange)}
      >
        <DateField.Group fullWidth variant="secondary">
          <DateField.Input slot="start">{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
          <DateRangePicker.RangeSeparator />
          <DateField.Input slot="end">{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
          <DateField.Suffix>
            <DateRangePicker.Trigger>
              <DateRangePicker.TriggerIndicator />
            </DateRangePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>
        <DateRangePicker.Popover>
          <RangeCalendar aria-label={HISTORY_FILTER_BAR_RANGE_ARIA_LABEL}>
            <RangeCalendar.Header>
              <RangeCalendar.YearPickerTrigger>
                <RangeCalendar.YearPickerTriggerHeading />
                <RangeCalendar.YearPickerTriggerIndicator />
              </RangeCalendar.YearPickerTrigger>
              <RangeCalendar.NavButton slot="previous" />
              <RangeCalendar.NavButton slot="next" />
            </RangeCalendar.Header>
            <RangeCalendar.Grid>
              <RangeCalendar.GridHeader>{(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}</RangeCalendar.GridHeader>
              <RangeCalendar.GridBody>{(date) => <RangeCalendar.Cell date={date} />}</RangeCalendar.GridBody>
            </RangeCalendar.Grid>
            <RangeCalendar.YearPickerGrid>
              <RangeCalendar.YearPickerGridBody>
                {({ year }) => <RangeCalendar.YearPickerCell year={year} />}
              </RangeCalendar.YearPickerGridBody>
            </RangeCalendar.YearPickerGrid>
          </RangeCalendar>
        </DateRangePicker.Popover>
      </DateRangePicker>
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
