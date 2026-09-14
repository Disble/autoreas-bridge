import { Button, DateField, DateRangePicker, Label, RangeCalendar, SearchField } from '@heroui/react';
import type { DateValue, RangeValue } from '@heroui/react';
import { parseDate } from '@internationalized/date';
import { LabeledSelect } from '../../../../shared/ui/LabeledSelect';
import {
  HISTORY_FILTER_BAR_ALL_VALUE,
  HISTORY_FILTER_BAR_RANGE_ARIA_LABEL,
  HISTORY_FILTER_BAR_RANGE_CLEAR_LABEL,
  HISTORY_FILTER_BAR_RANGE_PLACEHOLDER,
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
import { formatHistoryRangeLabel } from './history-params.helpers';
import type { HistoryFilterBarProps } from './history-filter-bar.types';

/**
 * Dumb filter bar for the History surface (design D5, D6): Search, Status,
 * Type, the watched-date range, and Sort, each labelled above its control in
 * one row. No Wails calls, no `useEffect`; every control is driven entirely
 * by props -- the caller (a colocated hook) owns the Search draft's debounce
 * and every write to the URL (CLAUDE.md FE #1).
 *
 * The watched range reads as a compact label ("Sep 1 – Sep 13, 2026") on a
 * trigger that opens the range calendar. A calendar pick is always ordered,
 * so it reports as one complete `{from, to}` write; the popover's Clear
 * action reports `undefined`.
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
  const rangeLabel = range === undefined ? HISTORY_FILTER_BAR_RANGE_PLACEHOLDER : formatHistoryRangeLabel(range);

  return (
    <section aria-label="History filters" className="flex flex-row flex-wrap items-end gap-3">
      <SearchField.Root
        aria-label={HISTORY_FILTER_BAR_SEARCH_ARIA_LABEL}
        className="w-45"
        onChange={onSearchChange}
        value={search}
        variant="secondary"
      >
        <Label>Search</Label>
        <SearchField.Group>
          <SearchField.Input className="ps-3" placeholder={HISTORY_FILTER_BAR_SEARCH_PLACEHOLDER} />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField.Root>
      <LabeledSelect
        ariaLabel={HISTORY_FILTER_BAR_STATUS_ARIA_LABEL}
        className="w-32"
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
        className="w-32"
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
        className="w-48"
        value={range === undefined ? null : { start: parseDate(range.from), end: parseDate(range.to) }}
        onChange={(value: RangeValue<DateValue> | null) => {
          if (value !== null) {
            onRangeChange({ from: value.start.toString(), to: value.end.toString() });
          }
        }}
      >
        <Label>Watched</Label>
        <DateField.Group fullWidth variant="secondary">
          <DateRangePicker.Trigger
            aria-label={`${HISTORY_FILTER_BAR_RANGE_ARIA_LABEL}, ${rangeLabel}`}
            className="h-full justify-between gap-2 px-3"
          >
            <span className={range === undefined ? 'truncate text-field-placeholder' : 'truncate text-field-foreground'}>{rangeLabel}</span>
            <DateRangePicker.TriggerIndicator />
          </DateRangePicker.Trigger>
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
          {range === undefined ? null : (
            <Button className="mt-2 w-full" size="sm" variant="tertiary" onPress={() => onRangeChange(undefined)}>
              {HISTORY_FILTER_BAR_RANGE_CLEAR_LABEL}
            </Button>
          )}
        </DateRangePicker.Popover>
      </DateRangePicker>
      <LabeledSelect
        ariaLabel={HISTORY_FILTER_BAR_SORT_ARIA_LABEL}
        className="w-38"
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
